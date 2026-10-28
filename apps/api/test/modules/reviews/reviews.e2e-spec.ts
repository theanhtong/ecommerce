import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import { OutboxService } from '../../../src/modules/notifications/outbox.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Reviews (e2e)', () => {
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

  async function shopWithItem() {
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
        name: `Cốc ${randomUUID().slice(0, 6)}`,
        weight: 300,
        tierVariations: [],
        models: [{ tierIndex: [], price: 40000, stock: 10 }],
      })
      .expect(201);
    return {
      s,
      shopId: shop.body.id as string,
      itemId: item.body.id as string,
      modelId: item.body.models[0].id as string,
    };
  }

  async function delivered(s: Account, modelId: string, b?: Account) {
    b ??= await signUp(app, emails);
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
    const placed = await as(b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: address.body.id,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    const order = placed.body.orders[0] as {
      id: string;
      items: { id: string }[];
    };
    await as(s).post(`/orders/${order.id}/ship`).expect(200);
    for (const status of ['picked_up', 'delivered']) {
      await as(s).post(`/orders/${order.id}/shipment`, { status }).expect(200);
    }
    return { b, orderId: order.id, lineId: order.items[0].id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
    await prisma.outboxEvent.deleteMany();
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

  it('lets the buyer review a completed order once, edit once and the seller reply once', async () => {
    const { s, shopId, itemId, modelId } = await shopWithItem();
    const { b, orderId, lineId } = await delivered(s, modelId);
    const stranger = await signUp(app, emails);
    const review = (body: object) =>
      as(b).post(`/order-items/${lineId}/review`, body);

    await review({ rating: 5 }).expect(409);
    const mine = () => as(b).get(`/items/${itemId}/reviews/mine`);
    await mine().expect(200, []);
    await as(b).post(`/orders/${orderId}/receive`).expect(200);
    expect((await mine().expect(200)).body).toMatchObject([
      { id: lineId, orderId, review: null },
    ]);
    await as(stranger).get(`/items/${itemId}/reviews/mine`).expect(200, []);
    await review({ rating: 6 }).expect(400);
    await as(stranger)
      .post(`/order-items/${lineId}/review`, { rating: 5 })
      .expect(404);
    const created = await review({ rating: 4, comment: 'Đẹp' }).expect(201);
    expect((await mine().expect(200)).body).toMatchObject([
      { id: lineId, review: { rating: 4, comment: 'Đẹp' } },
    ]);
    await review({ rating: 5 }).expect(409);

    const second = await delivered(s, modelId, b);
    await as(b).post(`/orders/${second.orderId}/receive`).expect(200);
    await as(b)
      .post(`/order-items/${second.lineId}/review`, { rating: 5 })
      .expect(201);
    expect(
      (await http().get(`/items/${itemId}`).expect(200)).body,
    ).toMatchObject({ rating: 4.5, ratingCount: 2 });

    const id = created.body.id as string;
    await as(stranger).patch(`/reviews/${id}`, { rating: 1 }).expect(404);
    await as(b).patch(`/reviews/${id}`, { rating: 2 }).expect(200);
    await as(b).patch(`/reviews/${id}`, { rating: 3 }).expect(409);
    expect(
      (await http().get(`/shops/${shopId}`).expect(200)).body,
    ).toMatchObject({ rating: 3.5, ratingCount: 2 });

    await as(b).post(`/reviews/${id}/reply`, { reply: 'Cảm ơn' }).expect(403);
    await as(s).post(`/reviews/${id}/reply`, { reply: 'Cảm ơn' }).expect(201);
    await as(s).post(`/reviews/${id}/reply`, { reply: 'Lần hai' }).expect(409);

    const low = await http()
      .get(`/items/${itemId}/reviews?rating=2`)
      .expect(200);
    expect(low.body.items).toMatchObject([
      {
        id,
        rating: 2,
        comment: null,
        sellerReply: 'Cảm ơn',
        buyer: b.username,
      },
    ]);
    const unanswered = await as(s)
      .get('/shops/me/reviews?replied=false')
      .expect(200);
    expect(unanswered.body.items).toMatchObject([
      { rating: 5, item: { id: itemId } },
    ]);

    const order = await as(b).get(`/orders/${orderId}`).expect(200);
    expect(order.body.items[0].review).toMatchObject({ id, rating: 2 });

    const notifications = app.get(NotificationsService);
    await app.get(OutboxService).relay(async (events) => {
      for (const event of events) await notifications.handle(event);
    });
    const inbox = await as(s).get('/notifications').expect(200);
    expect(
      inbox.body.items.filter((n: { type: string }) => n.type === 'new_review'),
    ).toHaveLength(2);
  });

  it('closes reviews 30 days after the order completes', async () => {
    const { s, itemId, modelId } = await shopWithItem();
    const { b, orderId, lineId } = await delivered(s, modelId);
    await as(b).post(`/orders/${orderId}/receive`).expect(200);
    await prisma.orderStatusHistory.updateMany({
      where: { orderId, toStatus: 'completed' },
      data: { createdAt: new Date(Date.now() - 31 * DAY_MS) },
    });
    await as(b)
      .post(`/order-items/${lineId}/review`, { rating: 5 })
      .expect(409);
    await as(b).get(`/items/${itemId}/reviews/mine`).expect(200, []);
  });
});
