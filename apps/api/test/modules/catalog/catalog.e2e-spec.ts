import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { bearer, createTestApp, signUp } from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const shirt = () => ({
  name: `Áo thun ${randomUUID().slice(0, 6)}`,
  weight: 300,
  description: 'Cotton 100%',
  tierVariations: [
    { name: 'Màu', options: ['Đỏ', 'Xanh'] },
    { name: 'Size', options: ['M', 'L'] },
  ],
  models: [
    { tierIndex: [0, 0], price: 150000, stock: 10, sku: 'AO-DO-M' },
    { tierIndex: [0, 1], price: 150000, stock: 5 },
    { tierIndex: [1, 0], price: 160000, stock: 0 },
    { tierIndex: [1, 1], price: 160000, stock: 3 },
  ],
});

const mug = () => ({
  name: `Cốc sứ ${randomUUID().slice(0, 6)}`,
  weight: 250,
  tierVariations: [],
  models: [{ tierIndex: [], price: 50000, stock: 20 }],
});

describe('Catalog (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Account;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (account: Account) => ({
    get: (url: string) => http().get(url).set(bearer(account.token)),
    post: (url: string, body: object) =>
      http().post(url).set(bearer(account.token)).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set(bearer(account.token)).send(body),
    put: (url: string, body: object) =>
      http().put(url).set(bearer(account.token)).send(body),
  });

  async function seller(status: 'active' | 'pending' = 'active') {
    const account = await signUp(app, emails);
    const shop = await as(account)
      .post('/shops', { name: `Shop ${randomUUID().slice(0, 8)}` })
      .expect(201);
    if (status === 'active') {
      await as(admin)
        .patch(`/admin/shops/${shop.body.id}/status`, { status: 'active' })
        .expect(200);
    }
    return { ...account, shopId: shop.body.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    const owners = { shop: { owner: { email: { in: emails } } } };
    await prisma.item.deleteMany({ where: owners });
    await prisma.shop.deleteMany({
      where: { owner: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe('creating items', () => {
    it('creates an item with two tiers and one model per combination', async () => {
      const s = await seller();
      const res = await as(s).post('/items', shirt()).expect(201);
      expect(res.body.status).toBe('active');
      expect(res.body.tierVariations).toEqual([
        { name: 'Màu', options: ['Đỏ', 'Xanh'] },
        { name: 'Size', options: ['M', 'L'] },
      ]);
      expect(res.body.models).toHaveLength(4);
      expect(res.body.models[0]).toMatchObject({
        tierIndex: [0, 0],
        price: 150000,
        sku: 'AO-DO-M',
        stock: 10,
        onHand: 10,
        reserved: 0,
      });
    });

    it('creates an item without variations as a single model', async () => {
      const s = await seller();
      const res = await as(s).post('/items', mug()).expect(201);
      expect(res.body.tierVariations).toEqual([]);
      expect(res.body.models).toEqual([
        expect.objectContaining({ tierIndex: [], price: 50000, stock: 20 }),
      ]);
    });

    it('rejects inconsistent variations', async () => {
      const s = await seller();
      const missing = { ...shirt(), models: shirt().models.slice(1) };
      const outOfRange = {
        ...mug(),
        tierVariations: [{ name: 'Màu', options: ['Trắng'] }],
        models: [{ tierIndex: [1], price: 1000, stock: 1 }],
      };
      const dupOption = {
        ...mug(),
        tierVariations: [{ name: 'Màu', options: ['Đỏ', 'đỏ'] }],
        models: [
          { tierIndex: [0], price: 1000, stock: 1 },
          { tierIndex: [1], price: 1000, stock: 1 },
        ],
      };
      const tooManyTiers = {
        ...shirt(),
        tierVariations: [
          ...shirt().tierVariations,
          { name: 'Chất liệu', options: ['Cotton'] },
        ],
      };
      for (const body of [missing, outOfRange, dupOption, tooManyTiers]) {
        await as(s).post('/items', body).expect(400);
      }
    });

    it('rejects invalid prices, stock and unknown fields', async () => {
      const s = await seller();
      const withModel = (patch: object) => ({
        ...mug(),
        models: [{ tierIndex: [], price: 50000, stock: 20, ...patch }],
      });
      await as(s)
        .post('/items', withModel({ price: 0 }))
        .expect(400);
      await as(s)
        .post('/items', withModel({ price: 1.5 }))
        .expect(400);
      await as(s)
        .post('/items', withModel({ stock: -1 }))
        .expect(400);
      await as(s)
        .post('/items', { ...mug(), status: 'banned' })
        .expect(400);
    });

    it('requires an active shop', async () => {
      const buyer = await signUp(app, emails);
      await as(buyer).post('/items', mug()).expect(403);
      const pending = await seller('pending');
      await as(pending).post('/items', mug()).expect(403);
      await http().post('/items').send(mug()).expect(401);
    });
  });

  describe('editing', () => {
    it('updates item fields and a single model separately', async () => {
      const s = await seller();
      const item = (await as(s).post('/items', shirt()).expect(201)).body;

      const renamed = await as(s)
        .patch(`/items/${item.id}`, { name: 'Áo thun mới', description: null })
        .expect(200);
      expect(renamed.body).toMatchObject({
        name: 'Áo thun mới',
        description: null,
      });
      expect(renamed.body.models).toHaveLength(4);

      const model = item.models[2];
      const updated = await as(s)
        .patch(`/models/${model.id}`, { price: 170000, sku: 'AO-XANH-M' })
        .expect(200);
      expect(updated.body).toMatchObject({
        id: model.id,
        price: 170000,
        sku: 'AO-XANH-M',
      });
      await as(s).patch(`/models/${model.id}`, { price: 0 }).expect(400);
      await as(s).patch(`/models/${model.id}`, { price: null }).expect(400);
      await as(s).patch(`/items/${item.id}`, { name: null }).expect(400);
      // Stock only changes through stock adjustments.
      await as(s).patch(`/models/${model.id}`, { stock: 7 }).expect(400);
    });

    it('replaces the variation structure', async () => {
      const s = await seller();
      const item = (await as(s).post('/items', shirt()).expect(201)).body;

      const replaced = await as(s)
        .put(`/items/${item.id}/variations`, {
          tierVariations: [{ name: 'Màu', options: ['Đen'] }],
          models: [{ tierIndex: [0], price: 99000, stock: 1 }],
        })
        .expect(200);
      expect(replaced.body.tierVariations).toEqual([
        { name: 'Màu', options: ['Đen'] },
      ]);
      expect(replaced.body.models).toEqual([
        expect.objectContaining({ tierIndex: [0], price: 99000 }),
      ]);
      // Old models are kept for past orders but are no longer sellable or editable.
      expect(
        await prisma.model.count({
          where: { itemId: item.id, deletedAt: { not: null } },
        }),
      ).toBe(4);
      await as(s)
        .patch(`/models/${item.models[0].id}`, { price: 1000 })
        .expect(404);
      const again = await as(s)
        .put(`/items/${item.id}/variations`, {
          tierVariations: [{ name: 'Màu', options: ['Đen'] }],
          models: [{ tierIndex: [0], price: 99000, stock: 1 }],
        })
        .expect(200);
      expect(again.body.models).toHaveLength(1);
    });

    it("hides other sellers' items and models behind 404", async () => {
      const owner = await seller();
      const other = await seller();
      const item = (await as(owner).post('/items', mug()).expect(201)).body;

      await as(other).patch(`/items/${item.id}`, { name: 'Hack' }).expect(404);
      await as(other)
        .patch(`/items/${item.id}/status`, { status: 'hidden' })
        .expect(404);
      const { tierVariations, models } = mug();
      await as(other)
        .put(`/items/${item.id}/variations`, { tierVariations, models })
        .expect(404);
      await as(other)
        .patch(`/models/${item.models[0].id}`, { price: 1000 })
        .expect(404);
      await as(other)
        .post(`/models/${item.models[0].id}/stock-adjustments`, {
          delta: -1,
          reason: 'adjust',
        })
        .expect(404);
      await as(other)
        .get(`/models/${item.models[0].id}/stock-movements`)
        .expect(404);

      const fresh = await http().get(`/items/${item.id}`).expect(200);
      expect(fresh.body.name).toBe(item.name);
    });
  });

  describe('visibility', () => {
    it('shows only active items of active shops in public views', async () => {
      const s = await seller();
      const visible = (await as(s).post('/items', mug()).expect(201)).body;
      const hidden = (await as(s).post('/items', shirt()).expect(201)).body;
      await as(s)
        .patch(`/items/${hidden.id}/status`, { status: 'hidden' })
        .expect(200);

      await http().get(`/items/${hidden.id}`).expect(404);
      const list = await http().get(`/shops/${s.shopId}/items`).expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([
        visible.id,
      ]);
      expect(list.body.items[0]).toMatchObject({
        priceMin: 50000,
        priceMax: 50000,
        stock: 20,
      });

      const mine = await as(s).get('/items/mine').expect(200);
      // Cursor pages are ordered by uuid v7 id, i.e. creation order.
      expect(mine.body.items.map((i: { id: string }) => i.id)).toEqual([
        visible.id,
        hidden.id,
      ]);
      const shirtSummary = mine.body.items.find(
        (i: { id: string }) => i.id === hidden.id,
      );
      expect(shirtSummary).toMatchObject({
        priceMin: 150000,
        priceMax: 160000,
        stock: 18,
      });

      await as(admin)
        .patch(`/admin/shops/${s.shopId}/status`, { status: 'banned' })
        .expect(200);
      await http().get(`/items/${visible.id}`).expect(404);
      await as(s).patch(`/items/${visible.id}`, { name: 'Edit' }).expect(403);
    });

    it('lets admins ban items, which sellers cannot undo', async () => {
      const s = await seller();
      const item = (await as(s).post('/items', mug()).expect(201)).body;

      await as(s)
        .patch(`/admin/items/${item.id}/status`, { status: 'banned' })
        .expect(403);
      await as(admin)
        .patch(`/admin/items/${item.id}/status`, { status: 'banned' })
        .expect(200);
      await http().get(`/items/${item.id}`).expect(404);
      await as(s)
        .patch(`/items/${item.id}/status`, { status: 'active' })
        .expect(403);
      await as(s)
        .post(`/models/${item.models[0].id}/stock-adjustments`, {
          delta: 1,
          reason: 'restock',
        })
        .expect(403);

      await as(admin)
        .patch(`/admin/items/${item.id}/status`, { status: 'active' })
        .expect(200);
      await http().get(`/items/${item.id}`).expect(200);
      await as(admin)
        .patch(`/admin/items/${randomUUID()}/status`, { status: 'banned' })
        .expect(404);
    });
  });

  describe('inventory', () => {
    const adjust = (
      account: Account,
      modelId: string,
      body: object,
      key?: string,
    ) => {
      const req = as(account).post(
        `/models/${modelId}/stock-adjustments`,
        body,
      );
      return key ? req.set('Idempotency-Key', key) : req;
    };

    it('adjusts stock relatively and records every movement', async () => {
      const s = await seller();
      const model = (await as(s).post('/items', mug()).expect(201)).body
        .models[0];

      const restocked = await adjust(s, model.id, {
        delta: 5,
        reason: 'restock',
      }).expect(201);
      expect(restocked.body).toMatchObject({
        stock: 25,
        onHand: 25,
        reserved: 0,
      });
      const damaged = await adjust(s, model.id, {
        delta: -3,
        reason: 'adjust',
      }).expect(201);
      expect(damaged.body.onHand).toBe(22);

      const history = await as(s)
        .get(`/models/${model.id}/stock-movements`)
        .expect(200);
      expect(
        history.body.items.map((m: { delta: number; reason: string }) => [
          m.delta,
          m.reason,
        ]),
      ).toEqual([
        [20, 'restock'],
        [5, 'restock'],
        [-3, 'adjust'],
      ]);
      expect(history.body.items[0]).not.toHaveProperty('idempotencyKey');
    });

    it('never lets on-hand stock drop below reserved stock', async () => {
      const s = await seller();
      const model = (await as(s).post('/items', mug()).expect(201)).body
        .models[0];

      await adjust(s, model.id, { delta: -21, reason: 'adjust' }).expect(409);
      await prisma.inventory.update({
        where: { modelId: model.id },
        data: { reserved: 15 },
      });
      await adjust(s, model.id, { delta: -6, reason: 'adjust' }).expect(409);
      const ok = await adjust(s, model.id, {
        delta: -5,
        reason: 'adjust',
      }).expect(201);
      expect(ok.body).toMatchObject({ onHand: 15, reserved: 15, stock: 0 });

      const history = await as(s)
        .get(`/models/${model.id}/stock-movements`)
        .expect(200);
      expect(history.body.items).toHaveLength(2);
      await expect(
        prisma.inventory.update({
          where: { modelId: model.id },
          data: { reserved: 16 },
        }),
      ).rejects.toThrow();
    });

    it('loses no update under concurrent adjustments', async () => {
      const s = await seller();
      const model = (await as(s).post('/items', mug()).expect(201)).body
        .models[0];

      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          adjust(s, model.id, { delta: i % 2 ? 1 : -1, reason: 'adjust' }),
        ),
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const row = await prisma.inventory.findUniqueOrThrow({
        where: { modelId: model.id },
      });
      expect(row.onHand).toBe(20);
      expect(
        await prisma.inventoryMovement.count({ where: { modelId: model.id } }),
      ).toBe(21);
    });

    it('applies a retried adjustment only once', async () => {
      const s = await seller();
      const model = (await as(s).post('/items', mug()).expect(201)).body
        .models[0];
      const key = randomUUID();

      await adjust(s, model.id, { delta: 4, reason: 'restock' }, key).expect(
        201,
      );
      const replay = await adjust(
        s,
        model.id,
        { delta: 4, reason: 'restock' },
        key,
      ).expect(201);
      expect(replay.body.onHand).toBe(24);

      const other = (
        await as(s)
          .post('/items', { ...mug() })
          .expect(201)
      ).body.models[0];
      await adjust(s, other.id, { delta: 4, reason: 'restock' }, key).expect(
        409,
      );
    });

    it('validates adjustments and shows buyers only sellable stock', async () => {
      const s = await seller();
      const item = (await as(s).post('/items', mug()).expect(201)).body;
      const modelId = item.models[0].id;

      await adjust(s, modelId, { delta: 0, reason: 'adjust' }).expect(400);
      await adjust(s, modelId, { delta: 1.5, reason: 'adjust' }).expect(400);
      await adjust(s, modelId, { delta: 1, reason: 'sale' }).expect(400);

      await prisma.inventory.update({
        where: { modelId },
        data: { reserved: 8 },
      });
      const pub = await http().get(`/items/${item.id}`).expect(200);
      expect(pub.body.models[0]).toEqual({
        id: modelId,
        tierIndex: [],
        price: 50000,
        sku: null,
        stock: 12,
      });
    });
  });
});
