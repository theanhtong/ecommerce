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

const HOUR_MS = 60 * 60 * 1000;

describe('Flash sales (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Account;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (account: Account) => ({
    get: (url: string) => http().get(url).set(bearer(account.token)),
    post: (url: string, body: object = {}) =>
      http().post(url).set(bearer(account.token)).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set(bearer(account.token)).send(body),
  });

  async function seller(stock = 10) {
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
        name: `Quạt ${randomUUID().slice(0, 6)}`,
        weight: 300,
        tierVariations: [],
        models: [{ tierIndex: [], price: 100000, stock }],
      })
      .expect(201);
    return {
      s,
      itemId: item.body.id as string,
      modelId: item.body.models[0].id as string,
    };
  }

  const sale = (
    modelId: string,
    overrides: Record<string, unknown> = {},
    model: Record<string, unknown> = {},
  ) => ({
    name: 'Giờ vàng',
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + HOUR_MS).toISOString(),
    models: [{ modelId, price: 60000, quota: 2, purchaseLimit: 1, ...model }],
    ...overrides,
  });

  async function buyer() {
    const b = await signUp(app, emails);
    const address = await as(b)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode: '00004',
        street: '144 Xuân Thủy',
      })
      .expect(201);
    return { b, addressId: address.body.id as string };
  }

  async function checkout(
    { b, addressId }: Awaited<ReturnType<typeof buyer>>,
    modelId: string,
    quantity = 1,
  ) {
    const cart = await as(b)
      .post('/cart/items', { modelId, quantity })
      .expect(201);
    const line = cart.body.shops[0].items.find(
      (l: { modelId: string }) => l.modelId === modelId,
    );
    // Adding again stacks onto a line left by an earlier failed checkout.
    await as(b).patch(`/cart/items/${line.id}`, { quantity }).expect(200);
    return as(b)
      .post('/checkout', {
        cartItemIds: [line.id],
        addressId,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID());
  }

  const buyNow = (
    { b, addressId }: Awaited<ReturnType<typeof buyer>>,
    id: string,
    quantity = 1,
    extra: object = {},
  ) =>
    as(b)
      .post('/checkout', {
        flashSale: { id, quantity },
        addressId,
        paymentMethod: 'cod',
        ...extra,
      })
      .set('Idempotency-Key', randomUUID());

  const stock = (modelId: string) =>
    prisma.inventory.findUniqueOrThrow({
      where: { modelId },
      select: { onHand: true, reserved: true },
    });
  const sold = async (modelId: string) =>
    (await prisma.flashSaleModel.findFirstOrThrow({ where: { modelId } })).sold;

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
    await prisma.promotion.deleteMany({ where: { shop: { owner: users } } });
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('validates a new flash sale', async () => {
    const { s, modelId } = await seller(5);
    const other = await seller();
    const post = (body: object) => as(s).post('/shops/me/flash-sales', body);

    await post(sale(modelId, {}, { price: 100000 })).expect(400);
    await post(sale(modelId, {}, { quota: 6 })).expect(400);
    await post(sale(modelId, {}, { purchaseLimit: 3 })).expect(400);
    await post(
      sale(modelId, {
        endsAt: new Date(Date.now() + 25 * HOUR_MS).toISOString(),
      }),
    ).expect(400);
    await post(sale(other.modelId)).expect(404);
    await as((await buyer()).b)
      .post('/shops/me/flash-sales', sale(modelId))
      .expect(404);

    const created = await post(sale(modelId)).expect(201);
    expect(created.body.models).toMatchObject([
      { modelId, price: 60000, originalPrice: 100000, quota: 2, sold: 0 },
    ]);
    await post(
      sale(modelId, {
        startsAt: new Date(Date.now() + HOUR_MS / 2).toISOString(),
        endsAt: new Date(Date.now() + 2 * HOUR_MS).toISOString(),
      }),
    ).expect(409);
  });

  it('sells at the flash price only through its own checkout, within the allowance', async () => {
    const { s, itemId, modelId } = await seller();
    const created = await as(s)
      .post('/shops/me/flash-sales', sale(modelId))
      .expect(201);
    const id = created.body.models[0].id as string;

    const page = await http().get(`/flash-sales/${id}`).expect(200);
    expect(page.body).toMatchObject({
      modelId,
      itemId,
      price: 60000,
      originalPrice: 100000,
      quota: 2,
      sold: 0,
      purchaseLimit: 1,
      status: 'running',
      shop: { name: expect.any(String) },
    });
    const item = await http().get(`/items/${itemId}`).expect(200);
    expect(item.body.models[0]).toMatchObject({
      price: 100000,
      flashSale: { id, price: 60000 },
    });

    // The cart never mixes in the flash price.
    const first = await buyer();
    const regular = await checkout(first, modelId);
    expect(regular.status).toBe(201);
    expect(regular.body.orders[0].items[0]).toMatchObject({
      price: 100000,
      originalPrice: null,
    });

    expect(
      (await as(first.b).get(`/flash-sales/${id}/allowance`).expect(200)).body,
    ).toEqual({ allowance: 1 });
    expect((await buyNow(first, id, 2)).status).toBe(409);
    await as(first.b)
      .post('/checkout', {
        flashSale: { id, quantity: 1 },
        cartItemIds: [randomUUID()],
        addressId: first.addressId,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(400);
    const preview = await as(first.b)
      .post('/checkout/preview', {
        flashSale: { id, quantity: 1 },
        addressId: first.addressId,
      })
      .expect(200);
    expect(preview.body.shops[0].itemsTotal).toBe(60000);

    const bought = await buyNow(first, id, 1, {
      expectedTotal: preview.body.total,
    });
    expect(bought.status).toBe(201);
    const order = bought.body.orders[0];
    expect(order.items).toMatchObject([
      { price: 60000, originalPrice: 100000, quantity: 1 },
    ]);
    expect(await sold(modelId)).toBe(1);
    expect(await stock(modelId)).toEqual({ onHand: 10, reserved: 2 });
    expect(
      (await as(first.b).get(`/flash-sales/${id}/allowance`).expect(200)).body,
    ).toEqual({ allowance: 0 });
    expect((await buyNow(first, id)).status).toBe(409);

    await as(first.b)
      .post(`/orders/${order.id}/cancel`, { reason: 'changed_mind' })
      .expect(200);
    expect(await sold(modelId)).toBe(0);
    expect((await buyNow(first, id)).status).toBe(201);

    await as(s)
      .post(`/shops/me/flash-sales/${created.body.id}/end`)
      .expect(200);
    expect(
      (await http().get(`/flash-sales/${id}`).expect(200)).body.status,
    ).toBe('ended');
    expect((await buyNow(await buyer(), id)).status).toBe(409);
  });

  it('refuses the checkout when the price moved since the buyer saw it', async () => {
    const { s, modelId } = await seller();
    const late = await buyer();
    const cart = await as(late.b)
      .post('/cart/items', { modelId, quantity: 1 })
      .expect(201);
    const body = {
      cartItemIds: [cart.body.shops[0].items[0].id],
      addressId: late.addressId,
    };
    const seen = (await as(late.b).post('/checkout/preview', body).expect(200))
      .body.total as number;

    await as(s).patch(`/models/${modelId}`, { price: 120000 }).expect(200);

    const refused = await as(late.b)
      .post('/checkout', { ...body, paymentMethod: 'cod', expectedTotal: seen })
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(refused.body.total).toBe(seen + 20000);
    await as(late.b)
      .post('/checkout', {
        ...body,
        paymentMethod: 'cod',
        expectedTotal: refused.body.total,
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
  });

  it('gives the last flash sale units to exactly as many buyers as the quota allows', async () => {
    const { s, itemId, modelId } = await seller();
    const created = await as(s)
      .post('/shops/me/flash-sales', sale(modelId))
      .expect(201);
    const id = created.body.models[0].id as string;
    const buyers = await Promise.all([1, 2, 3, 4, 5].map(() => buyer()));

    const results = await Promise.all(buyers.map((b) => buyNow(b, id)));
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 201, 409, 409, 409,
    ]);
    expect(await sold(modelId)).toBe(2);
    expect(await stock(modelId)).toEqual({ onHand: 10, reserved: 2 });

    const soldOut = await http().get(`/flash-sales/${id}`).expect(200);
    expect(soldOut.body.status).toBe('sold_out');
    const item = await http().get(`/items/${itemId}`).expect(200);
    expect(item.body.models[0].flashSale).toBeNull();
  });
});
