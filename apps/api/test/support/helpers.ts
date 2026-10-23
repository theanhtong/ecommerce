import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

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
  >();
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
