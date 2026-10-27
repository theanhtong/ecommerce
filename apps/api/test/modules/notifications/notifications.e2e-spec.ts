import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { NotificationsService } from '../../../src/modules/notifications/notifications.service.js';
import {
  OutboxService,
  type PublishedEvent,
} from '../../../src/modules/notifications/outbox.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

describe('Notifications (e2e)', () => {
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

  // Stands in for the worker: relays every pending event straight to the consumer.
  async function drain() {
    const notifications = app.get(NotificationsService);
    const published: PublishedEvent[] = [];
    await app.get(OutboxService).relay(async (events) => {
      published.push(...events);
      for (const event of events) await notifications.handle(event);
    });
    return published;
  }

  async function placed() {
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
        name: `Đèn ${randomUUID().slice(0, 6)}`,
        weight: 300,
        tierVariations: [],
        models: [{ tierIndex: [], price: 50000, stock: 5 }],
      })
      .expect(201);
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
      .post('/cart/items', { modelId: item.body.models[0].id, quantity: 1 })
      .expect(201);
    const checkout = await as(b)
      .post('/checkout', {
        cartItemIds: [cart.body.shops[0].items[0].id],
        addressId: address.body.id,
        paymentMethod: 'cod',
      })
      .set('Idempotency-Key', randomUUID())
      .expect(201);
    return { s, b, orderId: checkout.body.orders[0].id as string };
  }

  const inbox = async (account: Account) =>
    (await as(account).get('/notifications').expect(200)).body as {
      items: { id: string; type: string; audience: string; readAt: unknown }[];
      unread: number;
    };

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

  it('tells the other party about each step of an order', async () => {
    const { s, b, orderId } = await placed();
    await drain();
    expect((await inbox(s)).items).toMatchObject([
      { type: 'new_order', audience: 'seller', readAt: null },
    ]);
    expect((await inbox(b)).items).toEqual([]);

    await as(s).post(`/orders/${orderId}/ship`).expect(200);
    for (const status of ['picked_up', 'delivered']) {
      await as(s).post(`/orders/${orderId}/shipment`, { status }).expect(200);
    }
    await as(b)
      .post(`/orders/${orderId}/return`, { reason: 'damaged' })
      .expect(200);
    const events = await drain();
    expect(events.map((e) => e.type)).toEqual([
      'order.status_changed',
      'order.status_changed',
      'return.status_changed',
    ]);

    // A redelivered event adds nothing.
    for (const event of events) {
      await app.get(NotificationsService).handle(event);
    }
    const buyer = await inbox(b);
    expect(buyer).toMatchObject({
      unread: 2,
      items: [
        { type: 'order_delivered', audience: 'buyer' },
        { type: 'order_shipping', audience: 'buyer' },
      ],
    });
    expect((await inbox(s)).items.map((n) => n.type)).toEqual([
      'return_requested',
      'new_order',
    ]);

    await as(s).post(`/notifications/${buyer.items[0].id}/read`).expect(404);
    await as(b).post(`/notifications/${buyer.items[0].id}/read`).expect(204);
    expect((await inbox(b)).unread).toBe(1);
    await as(b).post('/notifications/read').expect(204);
    expect((await inbox(b)).unread).toBe(0);
  });

  it('keeps events in the outbox until they are published', async () => {
    const { s } = await placed();
    await expect(
      app.get(OutboxService).relay(() => Promise.reject(new Error('down'))),
    ).rejects.toThrow('down');
    expect(
      await prisma.outboxEvent.count({ where: { publishedAt: null } }),
    ).toBe(1);

    expect(await drain()).toHaveLength(1);
    expect(await drain()).toHaveLength(0);
    expect((await inbox(s)).items).toHaveLength(1);
  });
});
