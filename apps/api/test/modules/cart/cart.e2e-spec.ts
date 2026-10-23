import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { MAX_CART_MODELS } from '../../../src/modules/cart/cart.service.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
} from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const shirt = () => ({
  name: `Áo thun ${randomUUID().slice(0, 6)}`,
  weight: 300,
  tierVariations: [
    { name: 'Màu', options: ['Đỏ', 'Xanh'] },
    { name: 'Size', options: ['M', 'L'] },
  ],
  models: [
    { tierIndex: [0, 0], price: 150000, stock: 10 },
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

describe('Cart (e2e)', () => {
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
    delete: (url: string) => http().delete(url).set(bearer(account.token)),
  });

  async function seller(status: 'active' | 'pending' = 'active') {
    const account = await signUp(app, emails);
    const shop = await as(account)
      .post('/shops', {
        ...SHOP_ADDRESS,
        name: `Shop ${randomUUID().slice(0, 8)}`,
      })
      .expect(201);
    if (status === 'active') {
      await as(admin)
        .patch(`/admin/shops/${shop.body.id}/status`, { status: 'active' })
        .expect(200);
    }
    return { ...account, shopId: shop.body.id as string };
  }

  async function listed(owner: Account, body: object) {
    const res = await as(owner).post('/items', body).expect(201);
    return {
      itemId: res.body.id as string,
      modelIds: res.body.models.map((m: { id: string }) => m.id) as string[],
    };
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

  it('adds models, merges repeats and groups lines by shop', async () => {
    const [s1, s2, buyer] = [
      await seller(),
      await seller(),
      await signUp(app, emails),
    ];
    const a = await listed(s1, shirt());
    const b = await listed(s2, mug());

    await as(buyer).get('/cart').expect(200, { shops: [] });
    await as(buyer)
      .post('/cart/items', { modelId: a.modelIds[0], quantity: 2 })
      .expect(201);
    await as(buyer)
      .post('/cart/items', { modelId: b.modelIds[0], quantity: 1 })
      .expect(201);
    const res = await as(buyer)
      .post('/cart/items', { modelId: a.modelIds[0], quantity: 3 })
      .expect(201);

    expect(
      res.body.shops.map((g: { shop: { id: string } }) => g.shop.id),
    ).toEqual([s1.shopId, s2.shopId]);
    expect(res.body.shops[0].items).toEqual([
      expect.objectContaining({
        modelId: a.modelIds[0],
        itemId: a.itemId,
        quantity: 5,
        variation: 'Đỏ, M',
        addedPrice: 150000,
        price: 150000,
        priceChange: 0,
        stock: 10,
        purchasable: true,
      }),
    ]);
    expect(res.body.shops[1].items[0]).toMatchObject({
      variation: null,
      quantity: 1,
    });
  });

  it('never lets the quantity exceed available stock', async () => {
    const [s, buyer] = [await seller(), await signUp(app, emails)];
    const { modelIds } = await listed(s, shirt());

    await as(buyer)
      .post('/cart/items', { modelId: modelIds[2], quantity: 1 })
      .expect(409);
    await as(buyer)
      .post('/cart/items', { modelId: modelIds[1], quantity: 4 })
      .expect(201);
    const over = await as(buyer)
      .post('/cart/items', { modelId: modelIds[1], quantity: 2 })
      .expect(409);
    expect(over.body.message).toBe('Only 5 left in stock');

    const cart = await as(buyer).get('/cart').expect(200);
    const line = cart.body.shops[0].items[0];
    await as(buyer)
      .patch(`/cart/items/${line.id}`, { quantity: 6 })
      .expect(409);
    await as(buyer)
      .patch(`/cart/items/${line.id}`, { quantity: 0 })
      .expect(400);
    const updated = await as(buyer)
      .patch(`/cart/items/${line.id}`, { quantity: 5 })
      .expect(200);
    expect(updated.body.shops[0].items[0].quantity).toBe(5);
  });

  it('only offers models a buyer can see, and not from their own shop', async () => {
    const [s, pending, buyer] = [
      await seller(),
      await seller('pending'),
      await signUp(app, emails),
    ];
    const own = await listed(s, mug());
    await as(s)
      .post('/cart/items', { modelId: own.modelIds[0], quantity: 1 })
      .expect(403);

    await prisma.shop.update({
      where: { id: pending.shopId },
      data: { status: 'active' },
    });
    const hiddenShop = await listed(pending, mug());
    await prisma.shop.update({
      where: { id: pending.shopId },
      data: { status: 'pending' },
    });
    await as(buyer)
      .post('/cart/items', { modelId: hiddenShop.modelIds[0], quantity: 1 })
      .expect(404);

    const hidden = await listed(s, mug());
    await as(s)
      .patch(`/items/${hidden.itemId}/status`, { status: 'hidden' })
      .expect(200);
    await as(buyer)
      .post('/cart/items', { modelId: hidden.modelIds[0], quantity: 1 })
      .expect(404);
    await as(buyer)
      .post('/cart/items', { modelId: randomUUID(), quantity: 1 })
      .expect(404);
    await as(buyer)
      .post('/cart/items', { modelId: 'nope', quantity: 1 })
      .expect(400);
  });

  it('compares the current price with the price when added', async () => {
    const [s, buyer] = [await seller(), await signUp(app, emails)];
    const { modelIds } = await listed(s, mug());
    const modelId = modelIds[0];
    await as(buyer).post('/cart/items', { modelId, quantity: 1 }).expect(201);

    await as(s).patch(`/models/${modelId}`, { price: 45000 }).expect(200);
    const dropped = await as(buyer).get('/cart').expect(200);
    const line = dropped.body.shops[0].items[0];
    expect(line).toMatchObject({
      addedPrice: 50000,
      price: 45000,
      priceChange: -5000,
    });

    await as(s).patch(`/models/${modelId}`, { price: 60000 }).expect(200);
    await as(buyer)
      .patch(`/cart/items/${line.id}`, { quantity: 2 })
      .expect(200);
    const raised = await as(buyer).get('/cart').expect(200);
    expect(raised.body.shops[0].items[0]).toMatchObject({
      quantity: 2,
      addedPrice: 50000,
      priceChange: 10000,
    });

    const readded = await as(buyer)
      .post('/cart/items', { modelId, quantity: 1 })
      .expect(201);
    expect(readded.body.shops[0].items[0]).toMatchObject({
      quantity: 3,
      addedPrice: 60000,
      priceChange: 0,
    });
  });

  it('keeps lines that became unavailable but marks them', async () => {
    const [s, buyer] = [await seller(), await signUp(app, emails)];
    const { itemId, modelIds } = await listed(s, mug());
    await as(buyer)
      .post('/cart/items', { modelId: modelIds[0], quantity: 2 })
      .expect(201);

    await as(s)
      .patch(`/items/${itemId}/status`, { status: 'hidden' })
      .expect(200);
    const cart = await as(buyer).get('/cart').expect(200);
    expect(cart.body.shops[0].items[0]).toMatchObject({
      quantity: 2,
      purchasable: false,
    });
  });

  it('keeps every cart private to its owner', async () => {
    const [s, buyer, other] = [
      await seller(),
      await signUp(app, emails),
      await signUp(app, emails),
    ];
    const { modelIds } = await listed(s, mug());
    const cart = await as(buyer)
      .post('/cart/items', { modelId: modelIds[0], quantity: 1 })
      .expect(201);
    const lineId = cart.body.shops[0].items[0].id;

    await as(other).get('/cart').expect(200, { shops: [] });
    await as(other).patch(`/cart/items/${lineId}`, { quantity: 2 }).expect(404);
    await as(other).delete(`/cart/items/${lineId}`).expect(404);
    await http().get('/cart').expect(401);

    await as(buyer).delete(`/cart/items/${lineId}`).expect(200, { shops: [] });
    await as(buyer).delete(`/cart/items/${lineId}`).expect(404);
  });

  it(`refuses new lines beyond ${MAX_CART_MODELS}`, async () => {
    const [s, buyer] = [await seller(), await signUp(app, emails)];
    const { itemId, modelIds } = await listed(s, mug());
    await prisma.model.createMany({
      data: Array.from({ length: MAX_CART_MODELS }, (_, i) => ({
        itemId,
        tierIndex: [i],
        price: 1000,
      })),
    });
    const filler = await prisma.model.findMany({
      where: { itemId, id: { not: modelIds[0] } },
    });
    await prisma.cartItem.createMany({
      data: filler.map((m) => ({
        userId: buyer.id,
        modelId: m.id,
        quantity: 1,
        addedPrice: 1000,
      })),
    });

    await as(buyer)
      .post('/cart/items', { modelId: modelIds[0], quantity: 1 })
      .expect(409);
  });
});
