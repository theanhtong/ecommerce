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
type Seller = Account & { shopId: string; modelId: string };
type Buyer = Account & { addressId: string };

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Vouchers (e2e)', () => {
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

  const code = () =>
    `V${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  const terms = (extra: object = {}) => ({
    code: code(),
    name: 'Ưu đãi',
    discountKind: 'fixed',
    discountValue: 10000,
    minSpend: 0,
    usageLimit: 100,
    startsAt: new Date(Date.now() - DAY_MS).toISOString(),
    endsAt: new Date(Date.now() + DAY_MS).toISOString(),
    ...extra,
  });

  async function seller(price = 100000): Promise<Seller> {
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
        models: [{ tierIndex: [], price, stock: 20 }],
      })
      .expect(201);
    return {
      ...account,
      shopId: shop.body.id as string,
      modelId: item.body.models[0].id as string,
    };
  }

  async function buyer(): Promise<Buyer> {
    const account = await signUp(app, emails);
    const address = await as(account)
      .post('/addresses', {
        recipientName: 'Người Mua',
        phone: '0912345678',
        wardCode: '00004',
        street: '144 Xuân Thủy',
      })
      .expect(201);
    return { ...account, addressId: address.body.id as string };
  }

  async function cart(b: Buyer, shops: Seller[], quantity = 1) {
    const ids: string[] = [];
    for (const s of shops) {
      const res = await as(b)
        .post('/cart/items', { modelId: s.modelId, quantity })
        .expect(201);
      ids.push(
        res.body.shops
          .flatMap((g: { items: { id: string; modelId: string }[] }) => g.items)
          .find((l: { modelId: string }) => l.modelId === s.modelId).id,
      );
    }
    return ids;
  }

  const checkout = (
    b: Buyer,
    cartItemIds: string[],
    voucherCodes: string[],
    paymentMethod = 'cod',
  ) =>
    as(b)
      .post('/checkout', {
        cartItemIds,
        addressId: b.addressId,
        paymentMethod,
        voucherCodes,
      })
      .set('Idempotency-Key', randomUUID());

  const voucher = async (c: string) =>
    prisma.voucher.findUniqueOrThrow({ where: { code: c } });

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
    await prisma.promotion.deleteMany({ where: { shopId: null } });
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('lets shops and admins create vouchers within the rules', async () => {
    const s = await seller();
    const b = await buyer();
    const shopTerms = terms();
    const created = await as(s)
      .post('/shops/me/vouchers', {
        ...shopTerms,
        code: shopTerms.code.toLowerCase(),
      })
      .expect(201);
    expect(created.body).toMatchObject({
      type: 'shop_voucher',
      shopId: s.shopId,
      code: shopTerms.code,
      usedCount: 0,
    });

    await as(s).post('/shops/me/vouchers', shopTerms).expect(409);
    await as(s)
      .post('/shops/me/vouchers', terms({ code: 'a-b' }))
      .expect(400);
    await as(s)
      .post(
        '/shops/me/vouchers',
        terms({ discountKind: 'percent', discountValue: 150 }),
      )
      .expect(400);
    await as(s)
      .post(
        '/shops/me/vouchers',
        terms({ endsAt: new Date(Date.now() - 2 * DAY_MS) }),
      )
      .expect(400);
    await as(b).post('/shops/me/vouchers', terms()).expect(404);
    await as(s)
      .post('/admin/vouchers', { ...terms(), type: 'platform_voucher' })
      .expect(403);
    await as(admin)
      .post('/admin/vouchers', { ...terms(), type: 'shop_voucher' })
      .expect(400);
    await as(admin)
      .post('/admin/vouchers', { ...terms(), type: 'shipping_voucher' })
      .expect(201);

    const mine = await as(s).get('/shops/me/vouchers').expect(200);
    expect(mine.body.map((v: { code: string }) => v.code)).toEqual([
      shopTerms.code,
    ]);
  });

  it('applies shop, platform and shipping vouchers and books who pays for them', async () => {
    const [s1, s2] = [await seller(100000), await seller(50000)];
    const b = await buyer();
    const shopCode = (
      await as(s1)
        .post(
          '/shops/me/vouchers',
          terms({ discountValue: 20000, minSpend: 50000 }),
        )
        .expect(201)
    ).body.code;
    const platformCode = (
      await as(admin)
        .post('/admin/vouchers', {
          ...terms({
            discountKind: 'percent',
            discountValue: 10,
            maxDiscount: 9000,
          }),
          type: 'platform_voucher',
        })
        .expect(201)
    ).body.code;
    const shippingCode = (
      await as(admin)
        .post('/admin/vouchers', {
          ...terms({ discountValue: 15000 }),
          type: 'shipping_voucher',
        })
        .expect(201)
    ).body.code;

    const available = await as(b)
      .get(`/vouchers?shopIds=${s1.shopId},${s2.shopId}`)
      .expect(200);
    expect(available.body.map((v: { code: string }) => v.code)).toEqual(
      expect.arrayContaining([shopCode, platformCode, shippingCode]),
    );

    const lines = await cart(b, [s1, s2]);
    const codes = [shopCode, platformCode, shippingCode];
    const preview = await as(b)
      .post('/checkout/preview', {
        cartItemIds: lines,
        addressId: b.addressId,
        voucherCodes: codes,
      })
      .expect(200);
    const one = preview.body.shops.find(
      (x: { shop: { id: string } }) => x.shop.id === s1.shopId,
    );
    expect(one).toMatchObject({ itemsTotal: 100000, sellerDiscount: 20000 });
    // 10% of (80000 + 50000) is 13000, capped at 9000.
    expect(
      preview.body.shops.reduce(
        (n: number, x: { platformDiscount: number }) => n + x.platformDiscount,
        0,
      ),
    ).toBe(9000);

    const placed = await checkout(b, lines, codes).expect(201);
    expect(placed.body.orders.map((o: { total: number }) => o.total)).toEqual(
      preview.body.shops.map((x: { total: number }) => x.total),
    );
    const order = placed.body.orders.find(
      (o: { shop: { id: string } }) => o.shop.id === s1.shopId,
    );
    expect(order).toMatchObject({
      sellerDiscount: 20000,
      items: [expect.objectContaining({ sellerDiscount: 20000 })],
    });
    for (const c of codes) expect((await voucher(c)).usedCount).toBe(1);

    await as(b)
      .post('/cart/items', { modelId: s1.modelId, quantity: 1 })
      .expect(201);
    const again = await as(b).get('/cart').expect(200);
    await checkout(b, [again.body.shops[0].items[0].id], [shopCode]).expect(
      409,
    );

    await as(s1).post(`/orders/${order.id}/ship`).expect(200);
    for (const status of ['picked_up', 'delivered']) {
      await as(s1).post(`/orders/${order.id}/shipment`, { status }).expect(200);
    }
    await as(b).post(`/orders/${order.id}/receive`).expect(200);
    const entry = await prisma.ledgerEntry.findUniqueOrThrow({
      where: { idempotencyKey: `order:${order.id}:settlement` },
      include: { lines: { include: { account: true } } },
    });
    const line = (type: string) =>
      entry.lines.find((l) => l.account.type === type)?.amount ?? 0;
    const commission = Math.round(
      ((100000 - 20000) * Number(process.env.COMMISSION_RATE_BPS)) / 10_000,
    );
    expect(line('promotion')).toBe(
      order.platformDiscount + order.shippingDiscount,
    );
    expect(line('wallet')).toBe(-(100000 - 20000 - commission));
    expect(line('commission')).toBe(-commission);
    expect(line('receivable')).toBe(order.total);
  });

  it('refuses vouchers that do not fit the cart', async () => {
    const [s1, s2] = [await seller(), await seller()];
    const b = await buyer();
    const lines = await cart(b, [s1]);
    const shopVoucher = async (s: Seller, extra: object = {}) =>
      (await as(s).post('/shops/me/vouchers', terms(extra)).expect(201)).body;
    const platform = async (extra: object = {}) =>
      (
        await as(admin)
          .post('/admin/vouchers', {
            ...terms(extra),
            type: 'platform_voucher',
          })
          .expect(201)
      ).body;

    const [a, a2] = [await shopVoucher(s1), await shopVoucher(s1)];
    await checkout(b, lines, [a.code, a2.code]).expect(400);
    await checkout(b, lines, [(await shopVoucher(s2)).code]).expect(400);
    await checkout(b, lines, [
      (await platform()).code,
      (await platform()).code,
    ]).expect(400);
    await checkout(b, lines, [
      (await platform({ minSpend: 1_000_000 })).code,
    ]).expect(400);
    await checkout(b, lines, ['NOPE1234']).expect(409);

    const ended = await shopVoucher(s1);
    await as(s1).post(`/shops/me/vouchers/${ended.id}/end`).expect(200);
    await as(s1).post(`/shops/me/vouchers/${ended.id}/end`).expect(409);
    await checkout(b, lines, [ended.code]).expect(409);
    const available = await as(b)
      .get(`/vouchers?shopIds=${s1.shopId}`)
      .expect(200);
    expect(
      available.body.some((v: { code: string }) => v.code === ended.code),
    ).toBe(false);

    expect(await prisma.order.count({ where: { buyerId: b.id } })).toBe(0);
  });

  it('gives the last use of a voucher to only one buyer', async () => {
    const s = await seller();
    const one = (
      await as(s)
        .post('/shops/me/vouchers', terms({ usageLimit: 1 }))
        .expect(201)
    ).body;
    const [b1, b2] = [await buyer(), await buyer()];
    const [l1, l2] = [await cart(b1, [s]), await cart(b2, [s])];
    const results = await Promise.all([
      checkout(b1, l1, [one.code]),
      checkout(b2, l2, [one.code]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await voucher(one.code)).usedCount).toBe(1);
  });

  it('returns a platform voucher when its orders are cancelled, but not a shop voucher', async () => {
    const s = await seller();
    const b = await buyer();
    const shopCode = (
      await as(s).post('/shops/me/vouchers', terms()).expect(201)
    ).body.code;
    const platformCode = (
      await as(admin)
        .post('/admin/vouchers', { ...terms(), type: 'platform_voucher' })
        .expect(201)
    ).body.code;
    const placed = await checkout(b, await cart(b, [s]), [
      shopCode,
      platformCode,
    ]).expect(201);

    await as(b)
      .post(`/orders/${placed.body.orders[0].id}/cancel`, {
        reason: 'changed_mind',
      })
      .expect(200);
    expect((await voucher(platformCode)).usedCount).toBe(0);
    expect((await voucher(shopCode)).usedCount).toBe(1);
    await checkout(b, await cart(b, [s]), [platformCode]).expect(201);
  });
});
