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

const unique = () => randomUUID().replaceAll('-', '').slice(0, 10);

describe('Shops (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Awaited<ReturnType<typeof signUp>>;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const user = () => signUp(app, emails);
  const openShop = (token: string, fields: Record<string, unknown> = {}) =>
    http()
      .post('/shops')
      .set(bearer(token))
      .send({ ...SHOP_ADDRESS, name: `Cửa Hàng ${unique()}`, ...fields });
  const updateShop = (token: string, fields: Record<string, unknown>) =>
    http().patch('/shops/me').set(bearer(token)).send(fields);
  const setStatus = (id: string, status: string) =>
    http()
      .patch(`/admin/shops/${id}/status`)
      .set(bearer(admin.token))
      .send({ status });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({
      where: { owner: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('opens one pending shop per user', async () => {
    const { token } = await user();
    const res = await openShop(token).expect(201);
    expect(res.body.status).toBe('pending');

    await openShop(token).expect(409);
    const mine = await http().get('/shops/me').set(bearer(token)).expect(200);
    expect(mine.body.id).toBe(res.body.id);
  });

  it('rejects an exact duplicate shop name', async () => {
    const name = `Đồ Gỗ ${unique()}`;
    await openShop((await user()).token, { name }).expect(201);
    await openShop((await user()).token, { name }).expect(409);
  });

  it('validates the name and rejects unknown fields', async () => {
    const { token } = await user();
    for (const name of ['Shop', 'Shop 🙂 vui', 'Shop & Co', 'a'.repeat(31)]) {
      await openShop(token, { name }).expect(400);
    }
    await openShop(token, { name: undefined }).expect(400);
    await openShop(token, { username: 'shop_handle' }).expect(400);
    await openShop(token, { status: 'active' }).expect(400);
  });

  it('requires auth and reports a missing shop', async () => {
    const { token } = await user();
    await http().post('/shops').send({ name: 'Valid name' }).expect(401);
    await http().get('/shops/me').set(bearer(token)).expect(404);
  });

  it('serves an approved shop publicly by id', async () => {
    const { token } = await user();
    const shop = (await openShop(token).expect(201)).body;

    await http().get(`/shops/${shop.id}`).expect(404);
    await setStatus(shop.id, 'active').expect(200);

    const pub = await http().get(`/shops/${shop.id}`).expect(200);
    expect(pub.body).toEqual({
      id: shop.id,
      name: shop.name,
      description: null,
      createdAt: shop.createdAt,
    });
    await http().get('/shops/not-a-uuid').expect(400);
  });

  it('allows one shop rename per 30 days', async () => {
    const { token } = await user();
    const shop = (await openShop(token).expect(201)).body;

    await updateShop(token, { name: null }).expect(400);
    await updateShop(token, { name: `Tên Mới ${unique()}` }).expect(200);
    await updateShop(token, { name: `Tên Khác ${unique()}` }).expect(409);

    await prisma.shop.update({
      where: { id: shop.id },
      data: { nameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) },
    });
    await updateShop(token, { name: `Tên Khác ${unique()}` }).expect(200);
  });

  it('rejects renaming to a name another shop holds', async () => {
    const taken = (await openShop((await user()).token).expect(201)).body;
    const { token } = await user();
    await openShop(token).expect(201);
    await updateShop(token, { name: taken.name }).expect(409);
  });

  it('lets a rejected owner edit and resubmit, but not a banned one', async () => {
    const owner = await user();
    const shop = (await openShop(owner.token).expect(201)).body;

    await setStatus(shop.id, 'rejected').expect(200);
    await setStatus(shop.id, 'active').expect(409);

    const edited = await updateShop(owner.token, {
      description: 'Hàng thủ công',
    }).expect(200);
    expect(edited.body).toMatchObject({
      status: 'pending',
      description: 'Hàng thủ công',
    });

    await setStatus(shop.id, 'active').expect(200);
    await setStatus(shop.id, 'banned').expect(200);
    await http().get(`/shops/${shop.id}`).expect(404);
    await updateShop(owner.token, { description: 'x' }).expect(403);

    await setStatus(shop.id, 'active').expect(200);
  });

  it('keeps one pickup and return address on the shop', async () => {
    const { token } = await user();
    const setAddress = (body: object) =>
      http().put('/shops/me/address').set(bearer(token)).send(body);
    const warehouse = {
      contactName: 'Kho Demo',
      phone: '0912345678',
      wardCode: '00004',
      street: '1 Phố Kho',
    };

    await setAddress(warehouse).expect(404);
    await openShop(token, { wardCode: '99999' }).expect(400);
    await openShop(token, { street: undefined }).expect(400);
    const shop = (await openShop(token, warehouse).expect(201)).body;
    expect(shop).toMatchObject({
      contactName: 'Kho Demo',
      phone: '+84912345678',
      street: '1 Phố Kho',
      ward: { code: '00004', name: 'Phường Ba Đình' },
      province: { code: '01', name: 'Thành phố Hà Nội' },
    });
    expect(shop).not.toHaveProperty('wardCode');

    await setAddress({ ...warehouse, wardCode: '26740' }).expect(200);
    const moved = await http().get('/shops/me').set(bearer(token)).expect(200);
    expect(moved.body.province).toEqual({
      code: '79',
      name: 'Thành phố Hồ Chí Minh',
    });

    await setAddress({ ...warehouse, wardCode: '99999' }).expect(400);
    await setAddress({ ...warehouse, street: undefined }).expect(400);
    await setAddress({ ...warehouse, isPickup: true }).expect(400);

    await setStatus(shop.id, 'active').expect(200);
    await setStatus(shop.id, 'banned').expect(200);
    await setAddress(warehouse).expect(403);
    await http().put('/shops/me/address').send(warehouse).expect(401);
  });

  it('restricts admin endpoints and validates transitions', async () => {
    const { token } = await user();
    await http().get('/admin/shops').set(bearer(token)).expect(403);

    const shop = (await openShop(token).expect(201)).body;
    await http()
      .patch(`/admin/shops/${shop.id}/status`)
      .set(bearer(token))
      .send({ status: 'active' })
      .expect(403);
    await setStatus(shop.id, 'banned').expect(409);
    await setStatus(shop.id, 'nope').expect(400);
    await setStatus(randomUUID(), 'active').expect(404);

    const list = await http()
      .get('/admin/shops?status=pending&limit=100')
      .set(bearer(admin.token))
      .expect(200);
    const found = list.body.items.find((s: { id: string }) => s.id === shop.id);
    expect(found.owner).toEqual({
      id: expect.any(String),
      email: expect.any(String),
      username: expect.any(String),
    });
  });
});
