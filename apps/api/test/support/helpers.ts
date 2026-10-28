import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { OrdersService } from '../../src/modules/orders/orders.service.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';

const noThrottleStorage = {
  increment: async () => ({
    totalHits: 1,
    timeToExpire: 0,
    isBlocked: false,
    timeToBlockExpire: 0,
  }),
};

export async function createTestApp({ throttle = false } = {}): Promise<
  INestApplication<App>
> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!throttle)
    builder = builder
      .overrideProvider(getStorageToken())
      .useValue(noThrottleStorage);
  const app = (await builder.compile()).createNestApplication<
    INestApplication<App>
  >({ rawBody: true });
  configureApp(app);
  await app.init();
  return app;
}

export const refreshCookie = (res: request.Response): string => {
  const cookie = (res.get('Set-Cookie') ?? []).find((c) =>
    c.startsWith('refresh_token='),
  );
  if (!cookie) throw new Error('refresh_token cookie not set');
  return cookie.split(';')[0];
};

export const TEST_PASSWORD = 'correct horse battery';

export const testUsername = () =>
  `u_${randomUUID().replaceAll('-', '').slice(0, 12)}`;

export const SHOP_ADDRESS = {
  contactName: 'Kho',
  phone: '0901234567',
  wardCode: '00004',
  street: '1 Kho',
};

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Pushes the email into `created` so the caller can clean up afterwards.
export async function signUp(
  app: INestApplication<App>,
  created: string[],
  role: 'user' | 'admin' = 'user',
) {
  const http = () => request(app.getHttpServer());
  const prisma = app.get(PrismaService);
  const email = `user-${randomUUID()}@example.com`;
  created.push(email);
  await http()
    .post('/auth/register')
    .send({ email, username: testUsername(), password: TEST_PASSWORD })
    .expect(201);
  const user = await prisma.user.update({ where: { email }, data: { role } });
  // Log in after the role change so the access token carries it.
  const login = await http()
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  return {
    email,
    id: user.id,
    username: user.username,
    token: login.body.accessToken as string,
    cookie: refreshCookie(login),
  };
}

// Plays the carrier: backdates the shipment so the simulated carrier reports `status` right now.
export async function carrier(
  app: INestApplication,
  orderId: string,
  status: 'picked_up' | 'delivered',
) {
  const prisma = app.get(PrismaService);
  const orders = app.get(OrdersService);
  const longAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const { status: now } = await prisma.shipment.findUniqueOrThrow({
    where: { orderId },
  });
  if (now === 'awaiting_pickup') {
    await prisma.shipment.update({
      where: { orderId },
      data: { createdAt: longAgo },
    });
    await orders.advanceShipments(new Date(), orderId);
  }
  if (status === 'delivered' && now !== 'delivered') {
    await prisma.shipment.update({
      where: { orderId },
      data: { pickedUpAt: longAgo },
    });
    await orders.advanceShipments(new Date(), orderId);
  }
}
