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

  it('sells at the flash price within the quota and per-buyer limit', async () => {
    const { s, itemId, modelId } = await seller();
    const created = await as(s)
      .post('/shops/me/flash-sales', sale(modelId))
      .expect(201);

    const item = await http().get(`/items/${itemId}`).expect(200);
    expect(item.body.models[0]).toMatchObject({
      price: 100000,
      flashSale: { price: 60000, quota: 2, sold: 0, purchaseLimit: 1 },
    });
    const listed = await http().get('/flash-sales').expect(200);
    expect(
      listed.body.find((m: { modelId: string }) => m.modelId === modelId),
    ).toMatchObject({ price: 60000, originalPrice: 100000, sold: 0 });

    const first = await buyer();
    const cart = await as(first.b)
      .post('/cart/items', { modelId, quantity: 2 })
      .expect(201);
    expect(cart.body.shops[0].items[0]).toMatchObject({
      price: 60000,
      originalPrice: 100000,
    });
    const placed = await as(first.b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: first.addressId,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(409);
    expect(placed.body.message).toMatch('at most 1');

    await as(first.b)
      .patch(`/cart/items/${cart.body.shops[0].items[0].id}`, { quantity: 1 })
      .expect(200);
    const bought = await as(first.b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: first.addressId,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    const order = bought.body.orders[0];
    expect(order).toMatchObject({ itemsTotal: 60000 });
    expect(order.items[0]).toMatchObject({
      price: 60000,
      originalPrice: 100000,
    });
    expect(await sold(modelId)).toBe(1);
    expect((await checkout(first, modelId)).status).toBe(409);

    await as(first.b)
      .post(`/orders/${order.id}/cancel`, { reason: 'changed_mind' })
      .expect(200);
    expect(await sold(modelId)).toBe(0);
    expect((await checkout(first, modelId)).status).toBe(201);

    await as(s)
      .post(`/shops/me/flash-sales/${created.body.id}/end`)
      .expect(200);
    const after = await http().get(`/items/${itemId}`).expect(200);
    expect(after.body.models[0].flashSale).toBeNull();
    const regular = await checkout(await buyer(), modelId);
    expect(regular.status).toBe(201);
    expect(regular.body.orders[0].items[0]).toMatchObject({
      price: 100000,
      originalPrice: null,
    });
  });

  it('gives the last units to exactly as many buyers as the quota allows', async () => {
    const { s, itemId, modelId } = await seller();
    await as(s).post('/shops/me/flash-sales', sale(modelId)).expect(201);
    const buyers = await Promise.all([1, 2, 3, 4, 5].map(() => buyer()));
    const carts = await Promise.all(
      buyers.map(({ b }) =>
        as(b).post('/cart/items', { modelId, quantity: 1 }).expect(201),
      ),
    );

    const results = await Promise.all(
      buyers.map(({ b, addressId }, i) =>
        as(b)
          .post('/checkout', {
            cartItemIds: [carts[i].body.shops[0].items[0].id],
            addressId,
            paymentMethod: 'cod',
          })
          .set('Idempotency-Key', randomUUID()),
      ),
    );
    const statuses = results.map((r) => r.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 201, 409, 409, 409]);
    expect(await sold(modelId)).toBe(2);
    for (const r of results.filter((r) => r.status === 201)) {
      expect(r.body.orders[0].items[0].price).toBe(60000);
    }

    const soldOut = await http().get(`/items/${itemId}`).expect(200);
    expect(soldOut.body.models[0].flashSale).toBeNull();
  });
});
