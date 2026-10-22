import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Throttling has its own suite below.
const noThrottleStorage = {
  increment: async () => ({ totalHits: 1, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 }),
};

const refreshCookie = (res: request.Response): string => {
  const cookies = res.get('Set-Cookie') ?? [];
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('refresh_token cookie not set');
  return cookie.split(';')[0];
};

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `user-${randomUUID()}@example.com`;
  const password = 'correct horse battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getStorageToken())
      .useValue(noThrottleStorage)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
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
      .send({ email: `  ${email.toUpperCase()} `, password })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('refreshToken');
    const raw = res.get('Set-Cookie')!.find((c) => c.startsWith('refresh_token='))!;
    expect(raw).toMatch(/HttpOnly/);
    expect(raw).toMatch(/SameSite=Strict/);
    expect(raw).toMatch(/Path=\/auth/);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    const session = await prisma.session.findFirst({ where: { userId: user!.id } });
    expect(session?.tokenHash).not.toBe(refreshCookie(res).split('=')[1]);
  });

  it('rejects a duplicate email', () =>
    http().post('/auth/register').send({ email, password }).expect(409));

  it('rejects unknown fields and weak input', async () => {
    await http()
      .post('/auth/register')
      .send({ email: `x-${randomUUID()}@example.com`, password, role: 'admin' })
      .expect(400);
    await http().post('/auth/register').send({ email: 'not-an-email', password }).expect(400);
    await http()
      .post('/auth/register')
      .send({ email: `x-${randomUUID()}@example.com`, password: 'short' })
      .expect(400);
  });

  it('returns the same error for a wrong password and an unknown email', async () => {
    const wrong = await http().post('/auth/login').send({ email, password: 'wrong-password' }).expect(401);
    const unknown = await http()
      .post('/auth/login')
      .send({ email: `nobody-${randomUUID()}@example.com`, password })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('logs in and reads /auth/me without exposing the password hash', async () => {
    const login = await http().post('/auth/login').send({ email, password }).expect(200);
    const me = await http()
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, role: 'user', status: 'active' });
    expect(me.body).not.toHaveProperty('passwordHash');
  });

  it('rejects /auth/me without a valid token', async () => {
    await http().get('/auth/me').expect(401);
    await http().get('/auth/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rotates the refresh token and revokes the session when an old token is reused', async () => {
    const login = await http().post('/auth/login').send({ email, password }).expect(200);
    const first = refreshCookie(login);

    const rotated = await http().post('/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(rotated);
    expect(second).not.toBe(first);
    expect(rotated.body.accessToken).toEqual(expect.any(String));

    await http().post('/auth/refresh').set('Cookie', first).expect(401);
    await http().post('/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the session', async () => {
    const login = await http().post('/auth/login').send({ email, password }).expect(200);
    const cookie = refreshCookie(login);
    await http().post('/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('refresh fails without a cookie, and for banned users', async () => {
    await http().post('/auth/refresh').expect(401);

    const login = await http().post('/auth/login').send({ email, password }).expect(200);
    await prisma.user.update({ where: { email }, data: { status: 'banned' } });
    await http().post('/auth/refresh').set('Cookie', refreshCookie(login)).expect(401);
    await http().post('/auth/login').send({ email, password }).expect(401);
    await prisma.user.update({ where: { email }, data: { status: 'active' } });
  });
});

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(() => app.close());

  it('blocks the 6th login attempt within a minute', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: `nobody-${randomUUID()}@example.com`, password: 'whatever1' });
    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
  });
});
