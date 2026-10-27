import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { bearer, createTestApp, signUp } from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const home = (overrides: object = {}) => ({
  recipientName: 'Nguyễn Văn A',
  phone: '0912 345 678',
  wardCode: '00004',
  street: '144 Xuân Thủy',
  ...overrides,
});

describe('Addresses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const as = (account: Account) => ({
    get: (url: string) => http().get(url).set(bearer(account.token)),
    post: (url: string, body: object) =>
      http().post(url).set(bearer(account.token)).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set(bearer(account.token)).send(body),
    put: (url: string) => http().put(url).set(bearer(account.token)),
    delete: (url: string) => http().delete(url).set(bearer(account.token)),
  });

  const defaults = async (user: Account) =>
    (await as(user).get('/addresses').expect(200)).body
      .filter((a: { isDefault: boolean }) => a.isDefault)
      .map((a: { id: string }) => a.id);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('makes the first address the default and normalizes the phone', async () => {
    const user = await signUp(app, emails);
    const res = await as(user).post('/addresses', home()).expect(201);
    expect(res.body).toMatchObject({
      phone: '+84912345678',
      isDefault: true,
    });
    expect(res.body).not.toHaveProperty('userId');

    const second = await as(user)
      .post('/addresses', home({ phone: '+84 389.123.456' }))
      .expect(201);
    expect(second.body).toMatchObject({
      phone: '+84389123456',
      isDefault: false,
    });

    const list = await as(user).get('/addresses').expect(200);
    expect(list.body.map((a: { id: string }) => a.id)).toEqual([
      res.body.id,
      second.body.id,
    ]);
  });

  it('keeps exactly one default', async () => {
    const user = await signUp(app, emails);
    const first = await as(user).post('/addresses', home()).expect(201);
    const second = await as(user)
      .post('/addresses', home({ isDefault: true }))
      .expect(201);
    expect(await defaults(user)).toEqual([second.body.id]);

    await as(user).put(`/addresses/${first.body.id}/default`).expect(200);
    expect(await defaults(user)).toEqual([first.body.id]);

    await Promise.all([
      as(user).put(`/addresses/${first.body.id}/default`),
      as(user).put(`/addresses/${second.body.id}/default`),
    ]);
    expect(await defaults(user)).toHaveLength(1);
  });

  it('validates fields and allows partial updates', async () => {
    const user = await signUp(app, emails);
    for (const bad of [
      home({ phone: '012345' }),
      home({ phone: '+1 202 555 0100' }),
      home({ recipientName: '  ' }),
      home({ street: 'x'.repeat(201) }),
      home({ wardCode: '4' }),
      home({ wardCode: '99999' }),
      home({ province: 'Hà Nội' }),
    ]) {
      await as(user).post('/addresses', bad).expect(400);
    }
    const created = await as(user).post('/addresses', home()).expect(201);
    expect(created.body).toMatchObject({
      ward: { code: '00004', name: 'Phường Ba Đình' },
      province: { code: '01', name: 'Thành phố Hà Nội' },
    });
    expect(created.body).not.toHaveProperty('wardCode');

    const id = created.body.id;
    const updated = await as(user)
      .patch(`/addresses/${id}`, {
        street: '1 Tràng Tiền',
        wardCode: '00070',
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      street: '1 Tràng Tiền',
      ward: { code: '00070', name: 'Phường Hoàn Kiếm' },
      recipientName: 'Nguyễn Văn A',
    });
    await as(user).patch(`/addresses/${id}`, { wardCode: '99999' }).expect(400);
    await as(user).patch(`/addresses/${id}`, { wardCode: null }).expect(400);
    await as(user).patch(`/addresses/${id}`, { street: null }).expect(400);
    await as(user).patch(`/addresses/${id}`, { isDefault: false }).expect(400);
  });

  it('refuses to delete the default while other addresses exist', async () => {
    const user = await signUp(app, emails);
    const first = await as(user).post('/addresses', home()).expect(201);
    const second = await as(user).post('/addresses', home()).expect(201);

    await as(user).delete(`/addresses/${first.body.id}`).expect(409);
    await as(user).delete(`/addresses/${second.body.id}`).expect(204);
    await as(user).delete(`/addresses/${first.body.id}`).expect(204);
    await as(user).get('/addresses').expect(200, []);
  });

  it('keeps every address book private', async () => {
    const [user, other] = [
      await signUp(app, emails),
      await signUp(app, emails),
    ];
    const { body } = await as(user).post('/addresses', home()).expect(201);

    await as(other).get('/addresses').expect(200, []);
    await as(other).patch(`/addresses/${body.id}`, { street: 'x' }).expect(404);
    await as(other).put(`/addresses/${body.id}/default`).expect(404);
    await as(other).delete(`/addresses/${body.id}`).expect(404);
    await as(user).put(`/addresses/${randomUUID()}/default`).expect(404);
    await http().get('/addresses').expect(401);
  });
});
