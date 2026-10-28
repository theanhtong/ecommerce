import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  SHOP_ADDRESS,
  signUp,
  TEST_PASSWORD,
} from '../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

describe('Roles: admin, buyer and seller (e2e)', () => {
  let app: INestApplication<App>;
  let admin: Account;
  let buyer: Account;
  let seller: Account;
  let shopId: string;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (account: Account) => ({
    get: (url: string) => http().get(url).set(bearer(account.token)),
    patch: (url: string, body: object) =>
      http().patch(url).set(bearer(account.token)).send(body),
    post: (url: string, body: object) =>
      http().post(url).set(bearer(account.token)).send(body),
  });

  beforeAll(async () => {
    app = await createTestApp();
    admin = await signUp(app, emails, 'admin');
    buyer = await signUp(app, emails);
    seller = await signUp(app, emails);

    const shop = await as(seller)
      .post('/shops', { ...SHOP_ADDRESS, name: 'Cửa Hàng Người Bán' })
      .expect(201);
    shopId = shop.body.id;
    await as(admin)
      .patch(`/admin/shops/${shopId}/status`, { status: 'active' })
      .expect(200);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    await prisma.shop.deleteMany({
      where: { owner: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe('buyer', () => {
    it('reads own profile but has no shop', async () => {
      const me = await as(buyer).get('/users/me').expect(200);
      expect(me.body).toMatchObject({
        email: buyer.email,
        role: 'user',
        status: 'active',
      });
      await as(buyer).get('/shops/me').expect(404);
      await as(buyer).patch('/shops/me', { description: 'hack' }).expect(404);
    });

    it('can view the active shop publicly', async () => {
      const shop = await http().get(`/shops/${shopId}`).expect(200);
      expect(shop.body.name).toBe('Cửa Hàng Người Bán');
    });

    it('is locked out of every admin endpoint', async () => {
      await as(buyer).get('/admin/users').expect(403);
      await as(buyer).get('/admin/shops').expect(403);
      await as(buyer)
        .patch(`/admin/shops/${shopId}/status`, {
          status: 'banned',
          reason: 'Vi phạm',
        })
        .expect(403);
      await as(buyer)
        .patch(`/admin/users/${seller.id}/status`, {
          status: 'banned',
          reason: 'Vi phạm',
        })
        .expect(403);
    });
  });

  describe('seller', () => {
    it('manages only their own shop', async () => {
      const mine = await as(seller).get('/shops/me').expect(200);
      expect(mine.body).toMatchObject({ id: shopId, status: 'active' });

      const edited = await as(seller)
        .patch('/shops/me', { description: 'Đồ gỗ thủ công' })
        .expect(200);
      expect(edited.body.description).toBe('Đồ gỗ thủ công');
    });

    it('cannot open a second shop or use admin endpoints', async () => {
      await as(seller)
        .post('/shops', { ...SHOP_ADDRESS, name: 'Shop Thứ Hai' })
        .expect(409);
      await as(seller).get('/admin/shops').expect(403);
      await as(seller)
        .patch(`/admin/shops/${shopId}/status`, {
          status: 'banned',
          reason: 'Vi phạm',
        })
        .expect(403);
    });
  });

  describe('admin', () => {
    it('cannot buy or sell, but still reads public pages', async () => {
      const blocked: [string, string][] = [
        ['get', '/cart'],
        ['post', '/cart/items'],
        ['post', '/checkout'],
        ['get', '/orders'],
        ['get', '/addresses'],
        ['post', '/shops'],
        ['get', '/shops/me'],
        ['get', '/shops/me/orders'],
        ['get', '/shops/me/wallet'],
        ['post', '/items'],
        ['get', '/items/mine'],
        ['get', '/items/imports/template'],
      ];
      for (const [method, url] of blocked) {
        const res =
          method === 'get'
            ? await as(admin).get(url)
            : await as(admin).post(url, {});
        expect([url, res.status]).toEqual([url, 403]);
      }
      await as(admin).get('/items').expect(200);
      await as(admin).get(`/shops/${shopId}`).expect(200);
      await as(admin).get('/users/me').expect(200);
    });

    it('sees both accounts and the shop', async () => {
      const users = await as(admin).get('/admin/users?limit=100').expect(200);
      const ids = users.body.items.map((u: { id: string }) => u.id);
      expect(ids).toEqual(
        expect.arrayContaining([admin.id, buyer.id, seller.id]),
      );

      const shops = await as(admin)
        .get('/admin/shops?status=active')
        .expect(200);
      const shop = shops.body.items.find(
        (s: { id: string }) => s.id === shopId,
      );
      expect(shop.owner).toMatchObject({ id: seller.id, email: seller.email });
    });

    it("bans the seller's shop, hiding it and freezing edits, then restores it", async () => {
      await as(admin)
        .patch(`/admin/shops/${shopId}/status`, {
          status: 'banned',
          reason: 'Vi phạm',
        })
        .expect(200);
      await http().get(`/shops/${shopId}`).expect(404);
      await as(seller).patch('/shops/me', { description: 'x' }).expect(403);

      await as(admin)
        .patch(`/admin/shops/${shopId}/status`, { status: 'active' })
        .expect(200);
      await http().get(`/shops/${shopId}`).expect(200);
    });

    it('bans the buyer, ending their sessions, then restores the account', async () => {
      await as(admin)
        .patch(`/admin/users/${buyer.id}/status`, {
          status: 'banned',
          reason: 'Vi phạm',
        })
        .expect(200);
      await http()
        .post('/auth/refresh')
        .set('Cookie', buyer.cookie)
        .expect(401);
      await as(buyer).get('/users/me').expect(401);
      await http()
        .post('/auth/login')
        .send({ email: buyer.email, password: TEST_PASSWORD })
        .expect(403);

      await as(admin)
        .patch(`/admin/users/${buyer.id}/status`, { status: 'active' })
        .expect(200);
      await http()
        .post('/auth/login')
        .send({ email: buyer.email, password: TEST_PASSWORD })
        .expect(200);
    });
  });
});
