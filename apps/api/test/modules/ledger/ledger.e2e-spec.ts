import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { LedgerService } from '../../../src/modules/ledger/ledger.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

describe('Ledger (e2e)', () => {
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
    put: (url: string, body: object) =>
      http().put(url).set(bearer(account.token)).send(body),
  });
  const shipment = (s: Account, orderId: string, status: string) =>
    as(s).post(`/orders/${orderId}/shipment`, { status });

  async function seller() {
    const account = await signUp(app, emails);
    const shop = await as(account)
      .post('/shops', {
        ...SHOP_ADDRESS,
        name: `Shop ${randomUUID().slice(0, 8)}`,
      })
      .expect(201);
    await as(admin)
      .patch(`/admin/shops/${shop.body.id}/status`, { status: 'active' })
      .expect(200);
    const item = await as(account)
      .post('/items', {
        name: `Cốc ${randomUUID().slice(0, 6)}`,
        weight: 400,
        tierVariations: [],
        models: [{ tierIndex: [], price: 50000, stock: 20 }],
      })
      .expect(201);
    return { ...account, modelId: item.body.models[0].id as string };
  }

  async function order(s: Awaited<ReturnType<typeof seller>>, quantity = 1) {
    const b = await signUp(app, emails);
    const address = await as(b)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode: '00004',
        street: '1 Phố',
      })
      .expect(201);
    const cart = await as(b)
      .post('/cart/items', { modelId: s.modelId, quantity })
      .expect(201);
    const placed = await as(b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: address.body.id,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    return { b, order: placed.body.orders[0] };
  }

  async function complete(s: Account, b: Account, orderId: string) {
    await as(s).post(`/orders/${orderId}/ship`).expect(200);
    await shipment(s, orderId, 'picked_up').expect(200);
    await shipment(s, orderId, 'delivered').expect(200);
    return as(b).post(`/orders/${orderId}/receive`).expect(200);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    const users = { email: { in: emails } };
    await prisma.$executeRaw`TRUNCATE ledger_lines, ledger_entries, ledger_accounts`;
    await prisma.order.deleteMany({ where: { buyer: users } });
    await prisma.checkout.deleteMany({ where: { buyer: users } });
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('credits the shop minus commission when an order completes', async () => {
    const s = await seller();
    expect(
      await prisma.ledgerAccount.count({
        where: { type: 'wallet', shop: { ownerId: s.id } },
      }),
    ).toBe(1);
    await as(s).get('/shops/me/wallet').expect(200, {
      balance: 0,
      items: [],
      nextCursor: null,
    });

    const { b, order: placed } = await order(s, 2);
    expect(placed).toMatchObject({
      itemsTotal: 100_000,
      shippingFee: 16_500,
      total: 116_500,
    });
    await complete(s, b, placed.id);

    const wallet = await as(s).get('/shops/me/wallet').expect(200);
    expect(wallet.body).toMatchObject({
      balance: 95_000,
      items: [
        {
          amount: 95_000,
          refType: 'order',
          refId: placed.id,
          breakdown: {
            itemsTotal: 100_000,
            sellerDiscount: 0,
            commission: 5_000,
          },
        },
      ],
    });

    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { idempotencyKey: `order:${placed.id}:settlement` },
      include: { lines: { include: { account: true } } },
    });
    expect(
      Object.fromEntries(entry.lines.map((l) => [l.account.type, l.amount])),
    ).toEqual({
      receivable: 116_500,
      wallet: -95_000,
      commission: -5_000,
      shipping: -16_500,
    });

    const remit = (amount: number, key = 'cod-batch-1') =>
      as(admin)
        .post('/admin/ledger/cod-remittances', { amount })
        .set('Idempotency-Key', key);
    await remit(116_501).expect(409);
    await as(admin)
      .post('/admin/ledger/cod-remittances', { amount: 1 })
      .expect(400);
    await as(s)
      .post('/admin/ledger/cod-remittances', { amount: 1 })
      .set('Idempotency-Key', 'x')
      .expect(403);
    // The carrier keeps the shipping fee it is owed out of the COD it hands over.
    const remitted = {
      amount: 116_500,
      shippingFee: 16_500,
      received: 100_000,
    };
    expect((await remit(116_500).expect(200)).body).toEqual(remitted);
    expect((await remit(116_500).expect(200)).body).toEqual(remitted);
    const cash = (await as(admin).get('/admin/ledger/accounts').expect(200))
      .body;
    expect(cash.byType).toMatchObject({
      receivable: 0,
      shipping: 0,
      bank: 100_000,
    });
    expect(cash.total).toBe(0);

    const shopId = placed.shop.id as string;
    const board = await as(admin)
      .get(
        `/admin/ledger/shops?period=month&q=${encodeURIComponent(placed.shop.name)}`,
      )
      .expect(200);
    expect(board.body.items).toEqual([
      expect.objectContaining({
        id: shopId,
        itemsTotal: 100_000,
        orders: 1,
        commission: 5_000,
        balance: 95_000,
      }),
    ]);
    await as(admin).get('/admin/ledger/shops?sort=nope').expect(400);
    await as(s).get('/admin/ledger/shops').expect(403);
    const journal = await as(admin)
      .get(`/admin/ledger/entries?type=order&shopId=${shopId}`)
      .expect(200);
    expect(journal.body.items).toHaveLength(1);
    expect(journal.body.items[0].description).toContain(placed.shop.name);
    expect(
      journal.body.items[0].lines.reduce(
        (n: number, l: { amount: number }) => n + l.amount,
        0,
      ),
    ).toBe(0);
    const csv = await as(admin)
      .get(`/admin/ledger/entries.csv?shopId=${shopId}`)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(placed.id);
    expect(csv.text).toContain('Diễn giải');
    expect(
      (await as(admin).get(`/admin/ledger/shops/${shopId}/wallet`).expect(200))
        .body.balance,
    ).toBe(95_000);

    const platform = await as(admin).get('/admin/ledger/accounts').expect(200);
    expect(platform.body.total).toBe(0);
    expect(
      platform.body.items.find(
        (a: { shop: { id: string } | null }) => a.shop?.id === placed.shop.id,
      ),
    ).toMatchObject({ type: 'wallet', shop: placed.shop });
    await as(s).get('/admin/ledger/accounts').expect(403);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    }).format(new Date());
    const [year, month] = today.split('-').map(Number);
    const daily = await as(admin)
      .get('/admin/ledger/report?period=month')
      .expect(200);
    expect(daily.body.series).toHaveLength(new Date(year, month, 0).getDate());
    const current = daily.body.series.find(
      (p: { period: string }) => p.period === today,
    );
    expect(current.orders).toBeGreaterThanOrEqual(1);
    expect(current.profit).toBeGreaterThanOrEqual(5_000);
    expect(daily.body.totals).toMatchObject({
      orders: expect.any(Number),
      averageOrder: expect.any(Number),
      newUsers: expect.any(Number),
      newShops: expect.any(Number),
      cancelledOrders: expect.any(Number),
    });
    expect(daily.body.totals.profit).toBeGreaterThanOrEqual(current.profit);

    const hourly = await as(admin)
      .get('/admin/ledger/report?period=day')
      .expect(200);
    expect(hourly.body.series).toHaveLength(24);
    const monthly = await as(admin)
      .get('/admin/ledger/report?period=year')
      .expect(200);
    expect(monthly.body.series).toHaveLength(12);
    expect(
      monthly.body.series.find(
        (p: { period: string }) => p.period === today.slice(0, 7),
      ).profit,
    ).toBeGreaterThanOrEqual(current.profit);
    const past = await as(admin)
      .get('/admin/ledger/report?period=month&at=2020-02')
      .expect(200);
    expect(past.body.series).toHaveLength(29);
    expect(past.body.series[0].period).toBe('2020-02-01');
    expect(past.body.totals.orders).toBe(0);
    await as(admin).get('/admin/ledger/report?period=week').expect(400);
    await as(admin).get('/admin/ledger/report?at=2026-13').expect(400);
    await as(s).get('/admin/ledger/report').expect(403);
  });

  it('posts nothing for orders that do not complete', async () => {
    const s = await seller();
    const cancelled = await order(s);
    await as(cancelled.b).post(`/orders/${cancelled.order.id}/cancel`, {
      reason: 'changed_mind',
    });
    const inTransit = await order(s);
    await as(s).post(`/orders/${inTransit.order.id}/ship`).expect(200);
    await shipment(s, inTransit.order.id, 'picked_up').expect(200);

    expect(
      await prisma.ledgerEntry.count({
        where: { refId: { in: [cancelled.order.id, inTransit.order.id] } },
      }),
    ).toBe(0);
    expect((await as(s).get('/shops/me/wallet').expect(200)).body.balance).toBe(
      0,
    );
  });

  it('settles an order once even if asked again', async () => {
    const s = await seller();
    const { b, order: placed } = await order(s);
    const done = await complete(s, b, placed.id);
    await as(b).post(`/orders/${placed.id}/receive`).expect(409);

    const ledger = app.get(LedgerService);
    const shopId = done.body.shop.id as string;
    await prisma.$transaction((tx) =>
      ledger.settleOrder(tx, { ...placed, shopId }),
    );
    expect(
      await prisma.ledgerEntry.count({ where: { refId: placed.id } }),
    ).toBe(1);
    expect((await as(s).get('/shops/me/wallet').expect(200)).body.balance).toBe(
      47_500,
    );
  });

  it('rejects unbalanced entries and any change to posted rows', async () => {
    const s = await seller();
    const { b, order: placed } = await order(s);
    await complete(s, b, placed.id);
    const [line] = await prisma.ledgerLine.findMany({
      where: { entry: { refId: placed.id } },
      take: 1,
    });

    await expect(
      prisma.ledgerLine.update({
        where: { id: line.id },
        data: { amount: line.amount + 1 },
      }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.ledgerLine.delete({ where: { id: line.id } }),
    ).rejects.toThrow(/append-only/);
    await expect(
      prisma.$transaction(async (tx) => {
        const entry = await tx.ledgerEntry.create({
          data: {
            idempotencyKey: `test:${randomUUID()}`,
            refType: 'test',
            refId: randomUUID(),
          },
        });
        await tx.ledgerLine.create({
          data: { entryId: entry.id, accountId: line.accountId, amount: 1 },
        });
      }),
    ).rejects.toThrow(/does not balance/);
  });

  it('shows a wallet only to a shop owner', async () => {
    const buyer = await signUp(app, emails);
    await as(buyer).get('/shops/me/wallet').expect(404);
    await http().get('/shops/me/wallet').expect(401);
  });
});
