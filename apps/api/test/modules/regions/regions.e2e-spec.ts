import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from '../../support/helpers.js';

describe('Regions (e2e)', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists the 34 provinces and their wards without login', async () => {
    const provinces = await http().get('/regions/provinces').expect(200);
    expect(provinces.body).toHaveLength(34);
    expect(provinces.body[0]).toEqual({
      code: '01',
      name: 'Hà Nội',
      fullName: 'Thành phố Hà Nội',
    });

    const wards = await http().get('/regions/provinces/01/wards').expect(200);
    expect(wards.body[0]).toEqual({
      code: '00004',
      name: 'Ba Đình',
      fullName: 'Phường Ba Đình',
      type: 'ward',
    });
    expect(
      wards.body.every((w: { type: string }) =>
        ['ward', 'commune', 'special_zone'].includes(w.type),
      ),
    ).toBe(true);

    await http().get('/regions/provinces/00/wards').expect(404);
  });
});
