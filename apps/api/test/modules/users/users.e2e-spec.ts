import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  bearer,
  createTestApp,
  refreshCookie,
  signUp as signUp_,
  TEST_PASSWORD,
  testUsername,
} from '../../support/helpers.js';

describe('Users (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const password = TEST_PASSWORD;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const signUp = (role?: 'user' | 'admin') => signUp_(app, emails, role);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.shop.deleteMany({
      where: { owner: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  describe('profile', () => {
    const patchMe = (token: string, body: Record<string, unknown>) =>
      http().patch('/users/me').set(bearer(token)).send(body);

    it('lets any user change the username once per 30 days', async () => {
      const { id, email, token } = await signUp();
      const wanted = testUsername();

      const updated = await patchMe(token, {
        username: wanted.toUpperCase(),
      }).expect(200);
      expect(updated.body).toMatchObject({ email, username: wanted });
      expect(updated.body.usernameChangedAt).toEqual(expect.any(String));
      expect(updated.body).not.toHaveProperty('passwordHash');

      await patchMe(token, { username: wanted }).expect(200);
      await patchMe(token, { username: testUsername() }).expect(409);

      await prisma.user.update({
        where: { id },
        data: {
          usernameChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        },
      });
      await patchMe(token, { username: testUsername() }).expect(200);
    });

    it('rejects a taken username', async () => {
      const other = await signUp();
      const { token } = await signUp();
      await patchMe(token, { username: other.username }).expect(409);
    });

    it('rejects invalid input and protected fields', async () => {
      const { token } = await signUp();
      for (const username of [
        'abcd',
        'has space',
        'bad-dash',
        'a'.repeat(31),
      ]) {
        await patchMe(token, { username }).expect(400);
      }
      await patchMe(token, { username: null }).expect(400);
      await patchMe(token, { displayName: 'An' }).expect(400);
      await patchMe(token, { role: 'admin' }).expect(400);
      await patchMe(token, { email: 'x@example.com' }).expect(400);
    });
  });

  describe('change password', () => {
    it('requires the current password', async () => {
      const { token } = await signUp();
      await http()
        .patch('/users/me/password')
        .set(bearer(token))
        .send({
          currentPassword: 'wrong-password',
          newPassword: 'new password 123',
        })
        .expect(400);
    });

    it('changes the password and revokes other sessions but keeps the current one', async () => {
      const { email, token, cookie: current } = await signUp();
      const other = await http()
        .post('/auth/login')
        .send({ email, password })
        .expect(200);

      await http()
        .patch('/users/me/password')
        .set(bearer(token))
        .send({ currentPassword: password, newPassword: 'new password 123' })
        .expect(204);

      await http()
        .post('/auth/refresh')
        .set('Cookie', refreshCookie(other))
        .expect(401);
      await http().post('/auth/refresh').set('Cookie', current).expect(200);
      await http().post('/auth/login').send({ email, password }).expect(401);
      await http()
        .post('/auth/login')
        .send({ email, password: 'new password 123' })
        .expect(200);
    });
  });

  describe('admin', () => {
    it('forbids non-admins', async () => {
      const { token } = await signUp();
      await http().get('/admin/users').set(bearer(token)).expect(403);
      await http().get('/admin/users').expect(401);
    });

    it('lists users with cursor pagination', async () => {
      const admin = await signUp('admin');
      await signUp();
      await signUp();

      const first = await http()
        .get('/admin/users?limit=2')
        .set(bearer(admin.token))
        .expect(200);
      expect(first.body.items).toHaveLength(2);
      expect(first.body.items[0]).not.toHaveProperty('passwordHash');
      expect(first.body.nextCursor).toEqual(expect.any(String));

      const second = await http()
        .get(`/admin/users?limit=2&cursor=${first.body.nextCursor}`)
        .set(bearer(admin.token))
        .expect(200);
      const firstIds = first.body.items.map((u: { id: string }) => u.id);
      for (const u of second.body.items) expect(firstIds).not.toContain(u.id);

      await http()
        .get('/admin/users?limit=500')
        .set(bearer(admin.token))
        .expect(400);
    });

    it('bans a user, revoking their sessions, and can unban', async () => {
      const admin = await signUp('admin');
      const target = await signUp();

      const banned = await http()
        .patch(`/admin/users/${target.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'banned' })
        .expect(200);
      expect(banned.body.status).toBe('banned');

      await http()
        .post('/auth/refresh')
        .set('Cookie', target.cookie)
        .expect(401);
      await http().get('/users/me').set(bearer(target.token)).expect(401);
      await http()
        .post('/auth/login')
        .send({ email: target.email, password })
        .expect(401);

      await http()
        .patch(`/admin/users/${target.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'active' })
        .expect(200);
      await http()
        .post('/auth/login')
        .send({ email: target.email, password })
        .expect(200);
    });

    it('rejects self-ban, unknown users and bad ids', async () => {
      const admin = await signUp('admin');
      const status = (id: string) =>
        http()
          .patch(`/admin/users/${id}/status`)
          .set(bearer(admin.token))
          .send({ status: 'banned' });
      await status(admin.id).expect(400);
      await status(randomUUID()).expect(404);
      await status('not-a-uuid').expect(400);
    });
  });
});
