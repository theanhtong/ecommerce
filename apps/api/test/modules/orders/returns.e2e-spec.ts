import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { OrdersService } from '../../../src/modules/orders/orders.service.js';
import { ReturnsService } from '../../../src/modules/orders/returns.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
  carrier,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Returns (e2e)', () => {
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

  // A delivered order: the seller arranged it and reported pickup and delivery.
  async function delivered() {
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
        name: `Áo ${randomUUID().slice(0, 6)}`,
        weight: 300,
        tierVariations: [],
        models: [{ tierIndex: [], price: 100000, stock: 5 }],
      })
      .expect(201);
    const modelId = item.body.models[0].id as string;
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
      .post('/cart/items', { modelId, quantity: 2 })
      .expect(201);
    const placed = await as(b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: address.body.id,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    const order = placed.body.orders[0] as { id: string; total: number };
    await as(s).post(`/orders/${order.id}/ship`).expect(200);
    await carrier(app, order.id, 'delivered');
    return { s, b, order, modelId };
  }

  const stock = async (modelId: string) =>
    prisma.inventory.findUniqueOrThrow({
      where: { modelId },
      select: { onHand: true, reserved: true },
    });
  const wallet = async (s: Account) =>
    (await as(s).get('/shops/me/wallet').expect(200)).body.balance as number;
  const status = async (id: string) =>
    (await prisma.order.findUniqueOrThrow({ where: { id } })).status;

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

  it('takes a delivered order back when the seller accepts', async () => {
    const { s, b, order, modelId } = await delivered();
    const stranger = await signUp(app, emails);
    expect(await stock(modelId)).toEqual({ onHand: 3, reserved: 0 });

    await as(b)
      .post(`/orders/${order.id}/return`, { reason: 'changed_mind' })
      .expect(400);
    await as(stranger)
      .post(`/orders/${order.id}/return`, { reason: 'damaged' })
      .expect(404);
    const asked = await as(b)
      .post(`/orders/${order.id}/return`, { reason: 'damaged', note: 'Vỡ' })
      .expect(200);
    expect(asked.body.returnRequest).toMatchObject({
      status: 'requested',
      reason: 'damaged',
    });
    await as(b)
      .post(`/orders/${order.id}/return`, { reason: 'damaged' })
      .expect(409);
    await as(b).post(`/orders/${order.id}/receive`).expect(409);
    await as(b).post(`/orders/${order.id}/return/accept`).expect(403);

    const accepted = await as(s)
      .post(`/orders/${order.id}/return/accept`)
      .expect(200);
    expect(accepted.body).toMatchObject({
      status: 'returned',
      returnRequest: { status: 'accepted' },
    });
    expect(await stock(modelId)).toEqual({ onHand: 5, reserved: 0 });
    expect(await wallet(s)).toBe(0);
    expect(
      await prisma.refund.findUniqueOrThrow({ where: { orderId: order.id } }),
    ).toMatchObject({ amount: order.total, status: 'pending' });
    const accounts = await as(admin).get('/admin/ledger/accounts').expect(200);
    expect(accounts.body.total).toBe(0);
  });

  it('lets an admin settle a return the seller refused', async () => {
    const first = await delivered();
    await as(first.b).post(`/orders/${first.order.id}/receive`).expect(200);
    const earned = await wallet(first.s);
    expect(earned).toBeGreaterThan(0);

    await as(first.b)
      .post(`/orders/${first.order.id}/return`, { reason: 'wrong_item' })
      .expect(200);
    await as(first.s)
      .post(`/orders/${first.order.id}/return/reject`)
      .expect(400);
    const refused = await as(first.s)
      .post(`/orders/${first.order.id}/return/reject`, {
        note: 'Đúng hàng đã đặt',
      })
      .expect(200);
    expect(refused.body.returnRequest).toMatchObject({
      status: 'disputed',
      sellerNote: 'Đúng hàng đã đặt',
    });
    await as(first.s)
      .post(`/orders/${first.order.id}/return/accept`)
      .expect(409);

    const disputes = await as(admin)
      .get('/admin/returns?status=disputed')
      .expect(200);
    const id = disputes.body.items.find(
      (r: { orderId: string }) => r.orderId === first.order.id,
    ).id;
    await as(first.s).post(`/admin/returns/${id}/accept`).expect(403);
    await as(admin).post(`/admin/returns/${id}/accept`).expect(200);
    expect(await status(first.order.id)).toBe('returned');
    expect(await wallet(first.s)).toBe(0);
    const report = await as(first.s)
      .get('/shops/me/report?period=month')
      .expect(200);
    expect(report.body.totals).toMatchObject({
      earnings: 0,
      returned: earned,
      orders: 1,
    });

    const second = await delivered();
    await as(second.b)
      .post(`/orders/${second.order.id}/return`, { reason: 'defective' })
      .expect(200);
    await as(second.s)
      .post(`/orders/${second.order.id}/return/reject`, { note: 'Không lỗi' })
      .expect(200);
    const other = (
      await prisma.returnRequest.findUniqueOrThrow({
        where: { orderId: second.order.id },
      })
    ).id;
    await as(admin).post(`/admin/returns/${other}/reject`).expect(200);
    await as(admin).post(`/admin/returns/${other}/reject`).expect(409);
    await as(second.b).post(`/orders/${second.order.id}/receive`).expect(200);
  });

  it('closes the window after 15 days and accepts returns sellers ignore', async () => {
    const late = await delivered();
    await prisma.shipment.update({
      where: { orderId: late.order.id },
      data: { deliveredAt: new Date(Date.now() - 16 * DAY_MS) },
    });
    await as(late.b)
      .post(`/orders/${late.order.id}/return`, { reason: 'damaged' })
      .expect(409);

    const ignored = await delivered();
    await as(ignored.b)
      .post(`/orders/${ignored.order.id}/return`, { reason: 'missing_items' })
      .expect(200);
    const later = new Date(Date.now() + 4 * DAY_MS);
    await app.get(OrdersService).completeDelivered(later);
    expect(await status(ignored.order.id)).toBe('delivered');

    await app.get(ReturnsService).acceptUnanswered();
    expect(await status(ignored.order.id)).toBe('delivered');
    expect(
      await app.get(ReturnsService).acceptUnanswered(later),
    ).toBeGreaterThanOrEqual(1);
    expect(await status(ignored.order.id)).toBe('returned');
  });
});
