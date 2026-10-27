import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;
type Image = { id: string; url: string };

// The smallest valid PNG: 1x1, transparent.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('Item images (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Account;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (account: Account) => ({
    get: (url: string) => http().get(url).set(bearer(account.token)),
    post: (url: string, body: object = {}) =>
      http().post(url).set(bearer(account.token)).send(body),
    put: (url: string, body: object) =>
      http().put(url).set(bearer(account.token)).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set(bearer(account.token)).send(body),
    delete: (url: string) => http().delete(url).set(bearer(account.token)),
  });

  // What the browser does: ask for a signed form, then post the file straight to storage.
  async function upload(
    account: Account,
    file: Buffer,
    contentType = 'image/png',
  ) {
    const signed = await as(account)
      .post('/uploads/images', { contentType })
      .expect(201);
    const form = new FormData();
    for (const [name, value] of Object.entries(
      signed.body.fields as Record<string, string>,
    )) {
      form.append(name, value);
    }
    form.append('file', new Blob([new Uint8Array(file)], { type: contentType }));
    const res = await fetch(signed.body.url as string, {
      method: 'POST',
      body: form,
    });
    return { key: signed.body.key as string, status: res.status };
  }

  async function seller() {
    const s = await signUp(app, emails);
    const shop = await as(s)
      .post('/shops', {
        ...SHOP_ADDRESS,
        name: `Shop ${randomUUID().slice(0, 8)}`,
      })
      .expect(201);
    await as(admin)
      .patch(`/admin/shops/${shop.body.id}/status`, { status: 'active' })
      .expect(200);
    const item = await as(s)
      .post('/items', {
        name: `Bình ${randomUUID().slice(0, 6)}`,
        weight: 300,
        tierVariations: [],
        models: [{ tierIndex: [], price: 60000, stock: 5 }],
      })
      .expect(201);
    return {
      s,
      itemId: item.body.id as string,
      modelId: item.body.models[0].id as string,
    };
  }

  async function attach(s: Account, itemId: string) {
    const { key } = await upload(s, PNG);
    return (await as(s).post(`/items/${itemId}/images`, { key }).expect(201))
      .body as Image[];
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    const users = { email: { in: emails } };
    await prisma.$executeRaw`TRUNCATE ledger_lines, ledger_entries, ledger_accounts, bank_transfers, refunds, outbox_events`;
    await prisma.order.deleteMany({ where: { buyer: users } });
    await prisma.checkout.deleteMany({ where: { buyer: users } });
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('claims an upload into a public, immutable object under the item', async () => {
    const { s, itemId } = await seller();
    const { key, status } = await upload(s, PNG);
    expect(status).toBe(204);
    expect(key).toMatch(new RegExp(`^tmp/${s.id}/[0-9a-f-]+\\.png$`));
    expect(
      (
        await fetch(
          `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}/${key}`,
        )
      ).status,
    ).toBe(403);

    const stranger = await seller();
    await as(stranger.s)
      .post(`/items/${stranger.itemId}/images`, { key })
      .expect(400);
    await as(stranger.s).post(`/items/${itemId}/images`, { key }).expect(404);

    const [image] = (
      await as(s).post(`/items/${itemId}/images`, { key }).expect(201)
    ).body as Image[];
    expect(image.url).toMatch(`/${process.env.MINIO_BUCKET}/items/${itemId}/`);
    const served = await fetch(image.url);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);
    await as(s).post(`/items/${itemId}/images`, { key }).expect(400);

    const item = await http().get(`/items/${itemId}`).expect(200);
    expect(item.body.images).toEqual([image]);
    const mine = await as(s).get('/items/mine').expect(200);
    expect(
      mine.body.items.find((i: { id: string }) => i.id === itemId).image,
    ).toBe(image.url);
  });

  it('rejects files that are not what they claim or are too large', async () => {
    const { s, itemId } = await seller();
    await as(s)
      .post('/uploads/images', { contentType: 'image/gif' })
      .expect(400);

    const fake = await upload(s, Buffer.from('<svg onload=alert(1)>'));
    expect(fake.status).toBe(204);
    await as(s).post(`/items/${itemId}/images`, { key: fake.key }).expect(400);

    const big = await upload(s, Buffer.alloc(2 * 1024 * 1024 + 1));
    expect(big.status).toBe(400);
    await as(s).post(`/items/${itemId}/images`, { key: big.key }).expect(400);
  });

  it('keeps at most nine images in the order the seller chooses', async () => {
    const { s, itemId } = await seller();
    let images: Image[] = [];
    for (let i = 0; i < 9; i++) images = await attach(s, itemId);
    expect(images).toHaveLength(9);
    const { key } = await upload(s, PNG);
    await as(s).post(`/items/${itemId}/images`, { key }).expect(409);

    const reversed = images.map((i) => i.id).reverse();
    await as(s)
      .put(`/items/${itemId}/images`, { ids: reversed.slice(1) })
      .expect(400);
    const reordered = await as(s)
      .put(`/items/${itemId}/images`, { ids: reversed })
      .expect(200);
    expect(reordered.body.map((i: Image) => i.id)).toEqual(reversed);

    const removed = images[0];
    const left = await as(s)
      .delete(`/items/${itemId}/images/${removed.id}`)
      .expect(200);
    expect(left.body.map((i: Image) => i.id)).toEqual(reversed.slice(0, 8));
    expect((await fetch(removed.url)).status).toBe(404);
  });

  it('keeps the cover an order was placed with', async () => {
    const { s, itemId, modelId } = await seller();
    const [cover] = await attach(s, itemId);
    const b = await signUp(app, emails);
    const address = await as(b)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode: '00004',
        street: '144 Xuân Thủy',
      })
      .expect(201);
    const cart = await as(b)
      .post('/cart/items', { modelId, quantity: 1 })
      .expect(201);
    expect(cart.body.shops[0].items[0].image).toBe(cover.url);
    const placed = await as(b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: address.body.id,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);

    await as(s).delete(`/items/${itemId}/images/${cover.id}`).expect(200);
    expect((await fetch(cover.url)).status).toBe(200);
    const order = await as(b)
      .get(`/orders/${placed.body.orders[0].id}`)
      .expect(200);
    expect(order.body.items[0].image).toBe(cover.url);
  });
});
