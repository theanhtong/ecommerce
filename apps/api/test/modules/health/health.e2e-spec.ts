import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from '../../support/helpers.js';

describe('Health (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(() => app.close());

  it('answers liveness and readiness with a request id', async () => {
    const live = await request(app.getHttpServer()).get('/health').expect(200);
    expect(live.body).toEqual({ status: 'ok' });
    expect(live.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const ready = await request(app.getHttpServer())
      .get('/ready')
      .set('X-Request-Id', 'from-proxy-1')
      .expect(200);
    expect(ready.body).toEqual({
      status: 'ok',
      checks: { database: 'ok', storage: 'ok' },
    });
    expect(ready.headers['x-request-id']).toBe('from-proxy-1');
  });
});
