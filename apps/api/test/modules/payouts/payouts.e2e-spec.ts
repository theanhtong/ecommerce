import { INestApplication } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
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

const BANK = {
  bankName: 'MB Bank',
  accountNumber: '0123 456 789',
  accountName: 'NGUYEN VAN A',
};

describe('Payouts and refunds (e2e)', () => {
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
        name: `Áo ${randomUUID().slice(0, 6)}`,
        weight: 300,
        tierVariations: [],
        models: [{ tierIndex: [], price: 100000, stock: 10 }],
      })
      .expect(201);
    return { ...account, modelId: item.body.models[0].id as string };
  }

  async function order(
    s: Awaited<ReturnType<typeof seller>>,
    paymentMethod = 'cod',
  ) {
    const buyer = await signUp(app, emails);
    const address = await as(buyer)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode: '00004',
        street: '144 Xuân Thủy',
      })
      .expect(201);
    const cart = await as(buyer)
      .post('/cart/items', { modelId: s.modelId, quantity: 1 })
      .expect(201);
    const res = await as(buyer)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: address.body.id,
        paymentMethod,
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    return {
      buyer,
      checkoutId: res.body.checkoutId as string,
      order: res.body.orders[0] as { id: string; total: number },
    };
  }

  async function completed(s: Awaited<ReturnType<typeof seller>>) {
    const { buyer, order: o } = await order(s);
    await as(s).post(`/orders/${o.id}/ship`).expect(200);
    for (const status of ['picked_up', 'delivered']) {
      await as(s).post(`/orders/${o.id}/shipment`, { status }).expect(200);
    }
    await as(buyer).post(`/orders/${o.id}/receive`).expect(200);
    return o;
  }

  const balance = async (s: Account) =>
    (await as(s).get('/shops/me/wallet').expect(200)).body.balance as number;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    const users = { email: { in: emails } };
    await prisma.$executeRaw`TRUNCATE ledger_lines, ledger_entries, ledger_accounts, bank_transfers, refunds`;
    await prisma.order.deleteMany({ where: { buyer: users } });
    await prisma.checkout.deleteMany({ where: { buyer: users } });
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('pays out at once, never more than the wallet holds', async () => {
    const s = await seller();
    await completed(s);
    const earned = await balance(s);
    expect(earned).toBeGreaterThan(0);

    await as(s)
      .post('/shops/me/payouts', { ...BANK, amount: earned + 1 })
      .expect(409);
    await as(s)
      .post('/shops/me/payouts', { ...BANK, accountNumber: '12ab' })
      .expect(400);
    await as(admin).post('/shops/me/payouts', BANK).expect(403);

    const [a, b] = await Promise.all([
      as(s).post('/shops/me/payouts', { ...BANK, amount: earned - 1000 }),
      as(s).post('/shops/me/payouts', { ...BANK, amount: earned - 1000 }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const payout = (a.status === 201 ? a : b).body;
    expect(payout).toMatchObject({
      status: 'paid',
      decidedAt: expect.any(String),
      accountNumber: '0123456789',
    });
    expect(await balance(s)).toBe(1000);
    expect(
      await prisma.ledgerEntry.count({
        where: { idempotencyKey: `payout:${payout.id}:paid` },
      }),
    ).toBe(1);

    const wallet = await as(s).get('/shops/me/wallet').expect(200);
    expect(wallet.body.items[0]).toMatchObject({
      refType: 'payout',
      amount: -payout.amount,
      payout: { bankName: 'MB Bank', accountNumber: '0123456789' },
    });

    const mine = await as(s).get('/shops/me/payouts').expect(200);
    expect(mine.body.items).toEqual([
      expect.objectContaining({ id: payout.id }),
    ]);
    const shop = (await as(s).get('/shops/me').expect(200)).body;
    const shopWallet = await as(admin)
      .get(`/admin/ledger/shops/${shop.id}/wallet`)
      .expect(200);
    expect(shopWallet.body.items[0]).toMatchObject({
      refType: 'payout',
      payout: { accountName: 'NGUYEN VAN A' },
    });

    const accounts = await as(admin).get('/admin/ledger/accounts').expect(200);
    expect(accounts.body.total).toBe(0);
  });

  it('reports what the shop earned and sold', async () => {
    const s = await seller();
    await completed(s);
    const { order: cancelled } = await order(s);
    await as(s).post(`/orders/${cancelled.id}/cancel`).expect(200);
    await as(s)
      .post('/shops/me/payouts', { ...BANK, amount: 1000 })
      .expect(201);

    const report = await as(s).get('/shops/me/report?period=month').expect(200);
    const earned = (await as(s).get('/shops/me/wallet').expect(200)).body
      .balance;
    expect(report.body.totals).toMatchObject({
      itemsTotal: 100000,
      orders: 1,
      averageOrder: 100000,
      placedOrders: 2,
      cancelledOrders: 1,
      balance: earned,
    });
    expect(report.body.totals.earnings).toBe(earned + 1000);
    expect(report.body.totals.commission).toBe(
      100000 - report.body.totals.earnings,
    );
    const [year, month] = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
    })
      .format(new Date())
      .split('-')
      .map(Number);
    expect(report.body.series).toHaveLength(new Date(year, month, 0).getDate());
    await as(s).get('/shops/me/report?period=week').expect(400);
    await as(admin).get('/shops/me/report').expect(403);
  });

  it('lets the admin settle what is owed back to buyers', async () => {
    const s = await seller();
    const { order: o, checkoutId } = await order(s, 'online');
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { checkoutId },
    });
    const raw = JSON.stringify({
      id: Date.now(),
      transferType: 'in',
      transferAmount: payment.amount,
      content: payment.code,
      code: null,
      referenceCode: 'FT1',
    });
    const at = String(Math.floor(Date.now() / 1000));
    await http()
      .post('/payments/sepay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-SePay-Timestamp', at)
      .set(
        'X-SePay-Signature',
        `sha256=${createHmac('sha256', process.env.SEPAY_WEBHOOK_SECRET!)
          .update(`${at}.${raw}`)
          .digest('hex')}`,
      )
      .send(raw)
      .expect(200);
    await as(s).post(`/orders/${o.id}/cancel`).expect(200);

    const owed = await as(admin)
      .get('/admin/refunds?status=pending')
      .expect(200);
    const refund = owed.body.items.find(
      (r: { order: { id: string } | null }) => r.order?.id === o.id,
    );
    expect(refund).toMatchObject({
      amount: o.total,
      status: 'pending',
      order: { buyer: { id: expect.any(String) } },
    });

    await as(s).post(`/admin/refunds/${refund.id}/pay`).expect(403);
    await as(admin).post(`/admin/refunds/${refund.id}/pay`).expect(200);
    await as(admin).post(`/admin/refunds/${refund.id}/pay`).expect(409);
    expect(
      await prisma.ledgerEntry.count({
        where: { idempotencyKey: `refund:${refund.id}:paid` },
      }),
    ).toBe(1);
  });
});
