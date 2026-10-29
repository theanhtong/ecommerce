import { INestApplication } from '@nestjs/common';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { OrdersService } from '../../../src/modules/orders/orders.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
  carrier,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const HOUR_MS = 60 * 60 * 1000;

describe('Payments (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Account;
  const emails: string[] = [];
  let nextTransferId = Date.now();

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
        name: `Cốc ${randomUUID().slice(0, 6)}`,
        weight: 400,
        tierVariations: [],
        models: [{ tierIndex: [], price: 50000, stock: 10 }],
      })
      .expect(201);
    return {
      ...account,
      shopId: shop.body.id as string,
      modelId: item.body.models[0].id as string,
    };
  }

  // Two shops, so one transfer has to pay two orders.
  async function placed() {
    const shops = [await seller(), await seller()];
    const buyer = await signUp(app, emails);
    const address = await as(buyer)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode: '00004',
        street: '144 Xuân Thủy',
      })
      .expect(201);
    const lines: string[] = [];
    for (const s of shops) {
      const cart = await as(buyer)
        .post('/cart/items', { modelId: s.modelId, quantity: 2 })
        .expect(201);
      lines.push(
        cart.body.shops
          .flatMap((g: { items: { id: string; modelId: string }[] }) => g.items)
          .find((l: { modelId: string }) => l.modelId === s.modelId).id,
      );
    }
    const res = await as(buyer)
      .post('/checkout', {
        cartItemIds: lines,
        addressId: address.body.id,
        paymentMethod: 'online',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    const payment = await as(buyer)
      .get(`/checkouts/${res.body.checkoutId}/payment`)
      .expect(200);
    return {
      shops,
      buyer,
      orders: res.body.orders as {
        id: string;
        total: number;
        shop: { id: string };
      }[],
      payment: payment.body as {
        id: string;
        checkoutId: string;
        code: string;
        amount: number;
        qrUrl: string;
      },
    };
  }

  function webhook(
    body: object,
    { secret = process.env.SEPAY_WEBHOOK_SECRET!, at = Date.now() / 1000 } = {},
  ) {
    const raw = JSON.stringify(body);
    const timestamp = String(Math.floor(at));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`)
      .digest('hex')}`;
    return http()
      .post('/payments/sepay/webhook')
      .set('Content-Type', 'application/json')
      .set('X-SePay-Signature', signature)
      .set('X-SePay-Timestamp', timestamp)
      .send(raw);
  }

  const transfer = (amount: number, content: string) => ({
    id: nextTransferId++,
    gateway: 'MBBank',
    transactionDate: '2026-10-24 10:00:00',
    accountNumber: process.env.SEPAY_ACCOUNT,
    subAccount: '',
    code: null,
    content,
    transferType: 'in',
    description: content,
    transferAmount: amount,
    accumulated: 0,
    referenceCode: `FT${randomUUID().slice(0, 8)}`,
  });

  const statuses = async (orders: { id: string }[]) =>
    (
      await prisma.order.findMany({
        where: { id: { in: orders.map((o) => o.id) } },
        orderBy: { id: 'asc' },
      })
    ).map((o) => o.status);

  const entryLines = async (idempotencyKey: string) =>
    (
      await prisma.ledgerEntry.findUnique({
        where: { idempotencyKey },
        include: { lines: { include: { account: true } } },
      })
    )?.lines.map((l) => [l.account.type, l.amount]);

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

  it('shows the buyer what to transfer, and nobody else', async () => {
    const { buyer, orders, payment } = await placed();
    expect(payment).toMatchObject({
      code: expect.stringMatching(/^MKP[A-Z2-9]{8}$/),
      amount: orders.reduce((sum, o) => sum + o.total, 0),
      status: 'pending',
      bank: 'MB',
      accountNumber: process.env.SEPAY_ACCOUNT,
    });
    expect(new URL(payment.qrUrl).searchParams.get('des')).toBe(payment.code);
    const stranger = await signUp(app, emails);
    const { checkoutId } = payment;
    await as(stranger).get(`/checkouts/${checkoutId}/payment`).expect(404);
    await as(buyer).get(`/checkouts/${randomUUID()}/payment`).expect(404);
  });

  it('refuses webhooks without a valid, fresh signature', async () => {
    const body = transfer(1000, 'test');
    await http().post('/payments/sepay/webhook').send(body).expect(401);
    await webhook(body, { secret: 'wrong' }).expect(401);
    await webhook(body, { at: Date.now() / 1000 - 10 * 60 }).expect(401);
    await webhook({ id: 'x' }).expect(400);
    expect(
      await prisma.bankTransfer.count({ where: { providerId: body.id } }),
    ).toBe(0);
  });

  it('pays every order of the checkout once, however often the webhook repeats', async () => {
    const { orders, payment } = await placed();
    const body = transfer(
      payment.amount,
      `${payment.code.toLowerCase()} chuyen tien`,
    );

    const res = await webhook(body).expect(200);
    expect(res.body).toEqual({ success: true });
    await webhook(body).expect(200);

    expect(await statuses(orders)).toEqual(['to_ship', 'to_ship']);
    expect(
      await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).toMatchObject({
      status: 'paid',
      paidAt: expect.any(Date),
    });
    expect(
      await prisma.bankTransfer.findMany({ where: { providerId: body.id } }),
    ).toEqual([
      expect.objectContaining({ matched: true, paymentId: payment.id }),
    ]);
    expect(await entryLines(`payment:${payment.id}:received`)).toEqual(
      expect.arrayContaining([
        ['bank', payment.amount],
        ['prepaid', -payment.amount],
      ]),
    );

    // A second transfer for the same code is not a second payment.
    const again = transfer(payment.amount, payment.code);
    await webhook(again).expect(200);
    expect(
      await prisma.bankTransfer.findFirstOrThrow({
        where: { providerId: again.id },
      }),
    ).toMatchObject({ matched: false, paymentId: payment.id });
  });

  it('owes back a transfer with the wrong amount and keeps the orders unpaid', async () => {
    const { orders, payment } = await placed();
    const body = transfer(payment.amount - 1000, payment.code);
    await webhook(body).expect(200);

    expect(await statuses(orders)).toEqual(['unpaid', 'unpaid']);
    const row = await prisma.bankTransfer.findFirstOrThrow({
      where: { providerId: body.id },
    });
    expect(row).toMatchObject({ matched: false, paymentId: payment.id });
    expect(await entryLines(`transfer:${row.id}:unmatched`)).toEqual(
      expect.arrayContaining([
        ['bank', body.transferAmount],
        ['refund_due', -body.transferAmount],
      ]),
    );
  });

  it('cancels unpaid orders after the payment window and refuses later transfers', async () => {
    const orders = app.get(OrdersService);
    const { shops, orders: placedOrders, payment } = await placed();

    await orders.expireUnpaid();
    expect(await statuses(placedOrders)).toEqual(['unpaid', 'unpaid']);

    await orders.expireUnpaid(new Date(Date.now() + 25 * HOUR_MS));
    expect(await statuses(placedOrders)).toEqual(['cancelled', 'cancelled']);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe('expired');
    expect(
      await prisma.inventory.findUniqueOrThrow({
        where: { modelId: shops[0].modelId },
        select: { onHand: true, reserved: true },
      }),
    ).toEqual({ onHand: 10, reserved: 0 });

    const late = transfer(payment.amount, payment.code);
    await webhook(late).expect(200);
    expect(
      await prisma.bankTransfer.findFirstOrThrow({
        where: { providerId: late.id },
      }),
    ).toMatchObject({ matched: false });
  });

  it('settles a paid order from the prepayment and owes back a cancelled one', async () => {
    const { shops, buyer, orders, payment } = await placed();
    await webhook(transfer(payment.amount, payment.code)).expect(200);
    const [kept, dropped] = orders;
    const sellerOf = (order: (typeof orders)[number]) =>
      shops.find((x) => x.shopId === order.shop.id)!;

    await as(sellerOf(dropped))
      .post(`/orders/${dropped.id}/cancel`)
      .expect(200);
    expect(await entryLines(`order:${dropped.id}:refund`)).toEqual(
      expect.arrayContaining([
        ['prepaid', dropped.total],
        ['refund_due', -dropped.total],
      ]),
    );

    await as(sellerOf(kept)).post(`/orders/${kept.id}/ship`).expect(200);
    await carrier(app, kept.id, 'delivered');
    await as(buyer).post(`/orders/${kept.id}/receive`).expect(200);
    expect(await entryLines(`order:${kept.id}:settlement`)).toEqual(
      expect.arrayContaining([['prepaid', kept.total]]),
    );
  });
});
