import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import {
  createTestApp,
  refreshCookie,
  testUsername,
} from '../../support/helpers.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `user-${randomUUID()}@example.com`;
  const password = 'correct horse battery';
  const username = testUsername();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('registers, normalizes email, returns tokens and a hardened refresh cookie', async () => {
    const res = await http()
      .post('/auth/register')
      .send({
        email: `  ${email.toUpperCase()} `,
        username: `  ${username.toUpperCase()} `,
        password,
      })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');
    const raw = res
      .get('Set-Cookie')!
      .find((c) => c.startsWith('refresh_token='))!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\/auth/);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.username).toBe(username);
    const session = await prisma.session.findFirst({
      where: { userId: user!.id },
    });
    expect(session?.tokenHash).not.toBe(refreshCookie(res).split('=')[1]);
  });

  it('rejects a duplicate email or username', async () => {
    const dupEmail = await http()
      .post('/auth/register')
      .send({ email, username: testUsername(), password })
      .expect(409);
    expect(dupEmail.body.message).toBe('Email already registered');

    const dupUsername = await http()
      .post('/auth/register')
      .send({ email: `x-${randomUUID()}@example.com`, username, password })
      .expect(409);
    expect(dupUsername.body.message).toBe('Username already taken');
  });

  it('rejects unknown fields and weak input', async () => {
    const valid = () => ({
      email: `x-${randomUUID()}@example.com`,
      username: testUsername(),
      password,
    });
    const register = (body: Record<string, unknown>) =>
      http().post('/auth/register').send(body).expect(400);

    await register({ ...valid(), role: 'admin' });
    await register({ ...valid(), email: 'not-an-email' });
    await register({ ...valid(), password: 'short' });
    await register({ ...valid(), username: undefined });
    for (const bad of ['abcd', 'has space', 'bad-dash', 'a'.repeat(31)]) {
      await register({ ...valid(), username: bad });
    }
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const wrong = await http()
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
    const unknown = await http()
      .post('/auth/login')
      .send({ email: `nobody-${randomUUID()}@example.com`, password })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('logs in and reads /users/me without exposing the password hash', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const me = await http()
      .get('/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, role: 'user', status: 'active' });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('rejects /users/me without a valid token', async () => {
    await http().get('/users/me').expect(401);
    await http()
      .get('/users/me')
      .set('Authorization', 'Bearer not-a-jwt')
      .expect(401);
  });

  it('rotates the refresh token and revokes the session when an old token is reused', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const first = refreshCookie(login);

    const rotated = await http()
      .post('/auth/refresh')
      .set('Cookie', first)
      .expect(200);
    const second = refreshCookie(rotated);
    expect(second).not.toBe(first);
    expect(rotated.body.accessToken).toEqual(expect.any(String));

    await http().post('/auth/refresh').set('Cookie', first).expect(401);
    await http().post('/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the session', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    const cookie = refreshCookie(login);
    await http().post('/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('refresh fails without a cookie, and for banned users', async () => {
    await http().post('/auth/refresh').expect(401);

    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    await prisma.user.update({ where: { email }, data: { status: 'banned' } });
    await http()
      .post('/auth/refresh')
      .set('Cookie', refreshCookie(login))
      .expect(401);
    await http().post('/auth/login').send({ email, password }).expect(401);
    await prisma.user.update({ where: { email }, data: { status: 'active' } });
  });
});

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const attempt = () =>
    request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `nobody-${randomUUID()}@example.com`,
        password: 'whatever1',
      });

  beforeAll(async () => {
    // As in the containers: one proxy in front of the API.
    process.env.TRUST_PROXY_HOPS = '1';
    app = await createTestApp({ throttle: true });
  });

  afterAll(async () => {
    delete process.env.TRUST_PROXY_HOPS;
    await app.close();
  });

  it('blocks the 6th login attempt within a minute', async () => {
    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
  });

  it('limits each client behind the proxy on its own', async () => {
    const from = (ip: string) => attempt().set('X-Forwarded-For', ip);
    for (let i = 0; i < 5; i++) await from('203.0.113.7').expect(401);
    await from('203.0.113.7').expect(429);
    await from('203.0.113.8').expect(401);
  });
});
