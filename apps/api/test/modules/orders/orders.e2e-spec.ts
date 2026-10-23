import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { bearer, createTestApp, signUp } from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const HANOI_WARD = '00004';
const HCM_WARD = '26740';

const shirt = () => ({
  name: `Áo thun ${randomUUID().slice(0, 6)}`,
  weight: 300,
  tierVariations: [{ name: 'Size', options: ['M', 'L'] }],
  models: [
    { tierIndex: [0], price: 150000, stock: 5, sku: 'AO-M' },
    { tierIndex: [1], price: 160000, stock: 1 },
  ],
});

const mug = () => ({
  name: `Cốc sứ ${randomUUID().slice(0, 6)}`,
  weight: 400,
  tierVariations: [],
  models: [{ tierIndex: [], price: 50000, stock: 10 }],
});

describe('Orders (e2e)', () => {
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

  async function seller(wardCode: string | null = HANOI_WARD) {
    const account = await signUp(app, emails);
    const shop = await as(account)
      .post('/shops', { name: `Shop ${randomUUID().slice(0, 8)}` })
      .expect(201);
    await as(admin)
      .patch(`/admin/shops/${shop.body.id}/status`, { status: 'active' })
      .expect(200);
    if (wardCode) {
      await as(account)
        .put('/shops/me/address', {
          contactName: 'Kho',
          phone: '0901234567',
          wardCode,
          street: '1 Kho',
        })
        .expect(200);
    }
    return { ...account, shopId: shop.body.id as string };
  }

  async function buyer(wardCode = HANOI_WARD) {
    const account = await signUp(app, emails);
    const address = await as(account)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode,
        street: '144 Xuân Thủy',
      })
      .expect(201);
    return { ...account, addressId: address.body.id as string };
  }

  async function listed(owner: Account, body: object) {
    const res = await as(owner).post('/items', body).expect(201);
    return {
      itemId: res.body.id as string,
      modelIds: res.body.models.map((m: { id: string }) => m.id) as string[],
    };
  }

  async function addToCart(
    account: Account,
    modelId: string,
    quantity: number,
  ) {
    const cart = await as(account)
      .post('/cart/items', { modelId, quantity })
      .expect(201);
    const lines = cart.body.shops.flatMap(
      (g: { items: { id: string; modelId: string }[] }) => g.items,
    );
    return lines.find((l: { modelId: string }) => l.modelId === modelId)
      .id as string;
  }

  const checkout = (
    account: Account & { addressId: string },
    cartItemIds: string[],
    key: string | null = randomUUID(),
    paymentMethod = 'cod',
  ) => {
    const req = as(account).post('/checkout', {
      cartItemIds,
      addressId: account.addressId,
      paymentMethod,
    });
    return key === null ? req : req.set('Idempotency-Key', key);
  };

  const stock = async (modelId: string) =>
    prisma.inventory.findUniqueOrThrow({
      where: { modelId },
      select: { onHand: true, reserved: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    const users = { email: { in: emails } };
    await prisma.order.deleteMany({ where: { buyer: users } });
    await prisma.checkout.deleteMany({ where: { buyer: users } });
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  describe('checkout', () => {
    it('splits the cart into one order per shop and reserves stock', async () => {
      const [hanoiShop, hcmShop, b] = [
        await seller(HANOI_WARD),
        await seller(HCM_WARD),
        await buyer(HANOI_WARD),
      ];
      const a = await listed(hanoiShop, shirt());
      const m = await listed(hcmShop, mug());
      const lineA = await addToCart(b, a.modelIds[0], 2);
      const lineM = await addToCart(b, m.modelIds[0], 1);

      const res = await checkout(b, [lineA, lineM]).expect(201);
      expect(res.body.orders).toHaveLength(2);
      const byShop = Object.fromEntries(
        res.body.orders.map((o: { shop: { id: string } }) => [o.shop.id, o]),
      );

      // Same province, urban ward, 600 g.
      expect(byShop[hanoiShop.shopId]).toMatchObject({
        status: 'to_ship',
        itemsTotal: 300000,
        shippingFee: 16_500,
        total: 316_500,
        items: [
          {
            modelId: a.modelIds[0],
            modelName: 'M',
            sku: 'AO-M',
            price: 150000,
            quantity: 2,
          },
        ],
        shippingAddress: {
          recipientName: 'Người Mua',
          phone: '+84912345678',
          ward: { code: HANOI_WARD },
          province: { code: '01' },
        },
        pickupAddress: { province: { code: '01' } },
        history: [{ from: null, to: 'to_ship' }],
      });
      // Hồ Chí Minh to Hà Nội, 400 g.
      expect(byShop[hcmShop.shopId]).toMatchObject({
        itemsTotal: 50000,
        shippingFee: 23_900,
        total: 73_900,
        items: [{ modelName: null, quantity: 1 }],
        pickupAddress: { province: { code: '79' } },
      });

      expect(await stock(a.modelIds[0])).toEqual({ onHand: 5, reserved: 2 });
      await as(b).get('/cart').expect(200, { shops: [] });
      const product = await http().get(`/items/${a.itemId}`).expect(200);
      expect(product.body.models[0].stock).toBe(3);
    });

    it('replays a checkout with the same Idempotency-Key', async () => {
      const [s, b] = [await seller(), await buyer()];
      const { modelIds } = await listed(s, mug());
      const line = await addToCart(b, modelIds[0], 3);

      await checkout(b, [line], null).expect(400);
      const key = randomUUID();
      const [first, second] = await Promise.all([
        checkout(b, [line], key),
        checkout(b, [line], key),
      ]);
      expect([first.status, second.status]).toEqual([201, 201]);
      expect(second.body.checkoutId).toBe(first.body.checkoutId);
      const replay = await checkout(b, [line], key).expect(201);
      expect(replay.body.orders[0].id).toBe(first.body.orders[0].id);
      expect(await stock(modelIds[0])).toEqual({ onHand: 10, reserved: 3 });
      expect(await prisma.order.count({ where: { buyerId: b.id } })).toBe(1);
    });

    it('places nothing when any line cannot be fulfilled', async () => {
      const [s, b] = [await seller(), await buyer()];
      const { modelIds } = await listed(s, shirt());
      const ok = await addToCart(b, modelIds[0], 1);
      const scarce = await addToCart(b, modelIds[1], 1);
      await prisma.inventory.update({
        where: { modelId: modelIds[1] },
        data: { reserved: 1 },
      });

      await checkout(b, [ok, scarce]).expect(409);
      expect(await stock(modelIds[0])).toEqual({ onHand: 5, reserved: 0 });
      expect(await prisma.order.count({ where: { buyerId: b.id } })).toBe(0);
      expect(await prisma.cartItem.count({ where: { userId: b.id } })).toBe(2);
    });

    it('refuses lines that are not buyable from this cart', async () => {
      const [s, noAddress, b, other] = [
        await seller(),
        await seller(null),
        await buyer(),
        await buyer(),
      ];
      const { itemId, modelIds } = await listed(s, shirt());
      const line = await addToCart(b, modelIds[0], 1);

      await checkout({ ...b, addressId: other.addressId }, [line]).expect(404);
      await checkout(other, [line]).expect(409);
      await checkout(b, [randomUUID()]).expect(409);
      await as(b)
        .post('/checkout', { cartItemIds: [], addressId: b.addressId })
        .set('Idempotency-Key', randomUUID())
        .expect(400);

      const unshippable = await listed(noAddress, mug());
      const line2 = await addToCart(b, unshippable.modelIds[0], 1);
      const refused = await checkout(b, [line2]).expect(409);
      expect(refused.body.message).toMatch(/cannot ship orders yet/);

      await as(s)
        .patch(`/items/${itemId}/status`, { status: 'hidden' })
        .expect(200);
      await checkout(b, [line]).expect(409);
    });

    it('turns one cart line into at most one order', async () => {
      const [s, b] = [await seller(), await buyer()];
      const { modelIds } = await listed(s, mug());
      const line = await addToCart(b, modelIds[0], 2);

      const results = await Promise.all(
        Array.from({ length: 5 }, () => checkout(b, [line])),
      );
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        201, 409, 409, 409, 409,
      ]);
      expect(await prisma.order.count({ where: { buyerId: b.id } })).toBe(1);
      expect(await stock(modelIds[0])).toEqual({ onHand: 10, reserved: 2 });
    });

    it('lets only one side win when ship and cancel race', async () => {
      const [s, b] = [await seller(), await buyer()];
      const { modelIds } = await listed(s, mug());
      const line = await addToCart(b, modelIds[0], 2);
      const order = (await checkout(b, [line]).expect(201)).body.orders[0];

      const [shipped, cancelled] = await Promise.all([
        as(s).post(`/orders/${order.id}/ship`),
        as(b).post(`/orders/${order.id}/cancel`),
      ]);
      expect([shipped.status, cancelled.status].sort((x, y) => x - y)).toEqual([
        200, 409,
      ]);
      expect(await stock(modelIds[0])).toEqual(
        shipped.status === 200
          ? { onHand: 8, reserved: 0 }
          : { onHand: 10, reserved: 0 },
      );
    });

    it('lets only one of two buyers take the last unit', async () => {
      const s = await seller();
      const [b1, b2] = [await buyer(), await buyer()];
      const { modelIds } = await listed(s, shirt());
      const lines = await Promise.all(
        [b1, b2].map((b) => addToCart(b, modelIds[1], 1)),
      );

      const results = await Promise.all([
        checkout(b1, [lines[0]]),
        checkout(b2, [lines[1]]),
      ]);
      expect(results.map((r) => r.status).sort((x, y) => x - y)).toEqual([
        201, 409,
      ]);
      expect(await stock(modelIds[1])).toEqual({ onHand: 1, reserved: 1 });
    });
  });

  describe('lifecycle', () => {
    async function placed(paymentMethod = 'cod') {
      const [s, b] = [await seller(), await buyer()];
      const { itemId, modelIds } = await listed(s, shirt());
      const line = await addToCart(b, modelIds[0], 2);
      const res = await checkout(b, [line], randomUUID(), paymentMethod).expect(
        201,
      );
      return { s, b, itemId, modelId: modelIds[0], order: res.body.orders[0] };
    }

    it('holds online orders as unpaid until payment', async () => {
      const { s, b, modelId, order } = await placed('online');
      expect(order).toMatchObject({
        status: 'unpaid',
        paymentMethod: 'online',
        history: [{ from: null, to: 'unpaid' }],
      });
      expect(await stock(modelId)).toEqual({ onHand: 5, reserved: 2 });

      await as(s).post(`/orders/${order.id}/ship`).expect(409);
      await as(s).post(`/orders/${order.id}/cancel`).expect(403);
      const unpaid = await as(s).get('/shops/me/orders?status=unpaid');
      expect(unpaid.body.items.map((o: { id: string }) => o.id)).toEqual([
        order.id,
      ]);

      const cancelled = await as(b)
        .post(`/orders/${order.id}/cancel`)
        .expect(200);
      expect(cancelled.body.history.map((h: { to: string }) => h.to)).toEqual([
        'unpaid',
        'cancelled',
      ]);
      expect(await stock(modelId)).toEqual({ onHand: 5, reserved: 0 });
    });

    it('requires a known payment method', async () => {
      const [s, b] = [await seller(), await buyer()];
      const { modelIds } = await listed(s, mug());
      const line = await addToCart(b, modelIds[0], 1);
      await checkout(b, [line], randomUUID(), 'card').expect(400);
      const cod = await checkout(b, [line]).expect(201);
      expect(cod.body.orders[0]).toMatchObject({
        status: 'to_ship',
        paymentMethod: 'cod',
      });
    });

    it('ships, then lets the buyer confirm receipt', async () => {
      const { s, b, modelId, order } = await placed();

      await as(b).post(`/orders/${order.id}/ship`).expect(403);
      await as(b).post(`/orders/${order.id}/receive`).expect(409);
      const shipped = await as(s).post(`/orders/${order.id}/ship`).expect(200);
      expect(shipped.body.status).toBe('shipping');
      expect(await stock(modelId)).toEqual({ onHand: 3, reserved: 0 });

      await as(s).post(`/orders/${order.id}/ship`).expect(409);
      await as(b).post(`/orders/${order.id}/cancel`).expect(409);
      await as(s).post(`/orders/${order.id}/receive`).expect(403);
      const done = await as(b).post(`/orders/${order.id}/receive`).expect(200);
      expect(done.body.status).toBe('completed');
      expect(done.body.history.map((h: { to: string }) => h.to)).toEqual([
        'to_ship',
        'shipping',
        'completed',
      ]);

      const movements = await prisma.inventoryMovement.findMany({
        where: { modelId, refType: 'order' },
        orderBy: { id: 'asc' },
      });
      expect(movements.map((m) => [m.reason, m.delta])).toEqual([
        ['reserve', 2],
        ['sale', -2],
      ]);
    });

    it('releases the reservation when either side cancels before shipping', async () => {
      const first = await placed();
      await as(first.b).post(`/orders/${first.order.id}/cancel`).expect(200);
      expect(await stock(first.modelId)).toEqual({ onHand: 5, reserved: 0 });

      const second = await placed();
      const cancelled = await as(second.s)
        .post(`/orders/${second.order.id}/cancel`)
        .expect(200);
      expect(cancelled.body.status).toBe('cancelled');
      await as(second.s).post(`/orders/${second.order.id}/ship`).expect(409);
    });

    it('keeps the order snapshot when the seller edits the item', async () => {
      const { s, b, itemId, modelId, order } = await placed();
      await as(s).patch(`/items/${itemId}`, { name: 'Tên mới' }).expect(200);
      await as(s).patch(`/models/${modelId}`, { price: 1000 }).expect(200);
      await as(s)
        .put(`/items/${itemId}/variations`, {
          tierVariations: [],
          models: [{ tierIndex: [], price: 2000, stock: 1 }],
        })
        .expect(200);

      const after = await as(b).get(`/orders/${order.id}`).expect(200);
      expect(after.body.items).toEqual(order.items);
      expect(after.body.total).toBe(order.total);
      await as(s).post(`/orders/${order.id}/ship`).expect(200);
      expect(await stock(modelId)).toEqual({ onHand: 3, reserved: 0 });
    });

    it('shows an order only to its buyer and seller', async () => {
      const { s, b, order } = await placed();
      const stranger = await buyer();

      await as(stranger).get(`/orders/${order.id}`).expect(404);
      await as(stranger).post(`/orders/${order.id}/cancel`).expect(404);
      await as(s).get(`/orders/${order.id}`).expect(200);

      const mine = await as(b).get('/orders?status=to_ship').expect(200);
      expect(mine.body.items.map((o: { id: string }) => o.id)).toEqual([
        order.id,
      ]);
      await as(b).get('/orders?status=completed').expect(200, {
        items: [],
        nextCursor: null,
      });
      const shopOrders = await as(s).get('/shops/me/orders').expect(200);
      expect(shopOrders.body.items).toHaveLength(1);
      await as(b).get('/shops/me/orders').expect(404);
      await http().get('/orders').expect(401);
    });
  });
});
