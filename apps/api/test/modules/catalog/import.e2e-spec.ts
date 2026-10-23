import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { PrismaService } from '../../../src/prisma/prisma.service.js';
import { bearer, createTestApp, signUp } from '../../support/helpers.js';

type Account = Awaited<ReturnType<typeof signUp>>;

const HEADER =
  'Mã sản phẩm,Tên sản phẩm,Mô tả,Cân nặng (g),Tên phân loại 1,Phân loại 1,Tên phân loại 2,Phân loại 2,Giá,Tồn kho,SKU phân loại';

describe('Catalog CSV import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let admin: Account;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const upload = (account: Account, csv: string, filename = 'items.csv') =>
    http()
      .post('/items/imports')
      .set(bearer(account.token))
      .attach('file', Buffer.from(csv, 'utf8'), filename);

  async function seller(active = true) {
    const account = await signUp(app, emails);
    const shop = await http()
      .post('/shops')
      .set(bearer(account.token))
      .send({ name: `Shop ${randomUUID().slice(0, 8)}` })
      .expect(201);
    if (active) {
      await http()
        .patch(`/admin/shops/${shop.body.id}/status`)
        .set(bearer(admin.token))
        .send({ status: 'active' })
        .expect(200);
    }
    return { ...account, shopId: shop.body.id as string };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await signUp(app, emails, 'admin');
  });

  afterAll(async () => {
    await prisma.item.deleteMany({
      where: { shop: { owner: { email: { in: emails } } } },
    });
    await prisma.shop.deleteMany({
      where: { owner: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('serves a template that imports cleanly', async () => {
    const s = await seller();
    const template = await http()
      .get('/items/imports/template')
      .set(bearer(s.token))
      .expect(200)
      .expect('Content-Type', /text\/csv/);
    expect(template.text.startsWith(`﻿${HEADER}\r\n`)).toBe(true);

    const res = await upload(s, template.text).expect(200);
    expect(res.body).toMatchObject({ created: 2, failed: 0 });
    expect(
      res.body.results.map((r: { parentSku: string; rows: number[] }) => [
        r.parentSku,
        r.rows,
      ]),
    ).toEqual([
      ['AO-001', [2, 3, 4, 5]],
      ['COC-001', [6]],
    ]);

    const shirt = await http()
      .get(`/items/${res.body.results[0].itemId}`)
      .expect(200);
    expect(shirt.body).toMatchObject({
      parentSku: 'AO-001',
      name: 'Áo thun cotton',
      tierVariations: [
        { name: 'Màu', options: ['Trắng', 'Đen'] },
        { name: 'Size', options: ['M', 'L'] },
      ],
    });
    expect(
      shirt.body.models.map((m: { tierIndex: number[]; stock: number }) => [
        m.tierIndex,
        m.stock,
      ]),
    ).toEqual([
      [[0, 0], 10],
      [[0, 1], 8],
      [[1, 0], 5],
      [[1, 1], 0],
    ]);
    const history = await http()
      .get(`/models/${shirt.body.models[0].id}/stock-movements`)
      .set(bearer(s.token))
      .expect(200);
    expect(history.body.items).toEqual([
      expect.objectContaining({ delta: 10, reason: 'restock' }),
    ]);
  });

  it('creates valid items and reports the rest row by row', async () => {
    const s = await seller();
    const csv = [
      HEADER,
      'OK-1,"Bàn gỗ, sồi",Chắc chắn,500,,,,,1200000,3,',
      'BAD-PRICE,Ghế,,500,,,,,0,3,',
      'BAD-NUM,Kệ,,500,,,,,"1.000",3,',
      'GAP,Áo,,500,Màu,Đỏ,Size,M,100000,1,',
      'GAP,Áo,,500,Màu,Xanh,Size,L,100000,1,',
      ',Không mã,,500,,,,,1000,1,',
      `LONG,Tên dài,,500,Màu,${'x'.repeat(31)},,,1000,1,`,
    ].join('\n');

    const res = await upload(s, csv).expect(200);
    expect(res.body).toMatchObject({ created: 1, failed: 5 });
    const byRow = Object.fromEntries(
      res.body.results.map(
        (r: { rows: number[]; status: string; error?: string }) => [
          r.rows[0],
          r.error ?? r.status,
        ],
      ),
    );
    expect(byRow[2]).toBe('created');
    expect(byRow[3]).toBe('Row 3: "Giá" must not be less than 1');
    expect(byRow[4]).toBe('Row 4: "Giá" must be a whole number');
    expect(byRow[5]).toBe('Expected 4 models, one per option combination');
    expect(byRow[7]).toBe('Row 7: "Mã sản phẩm" is required');
    expect(byRow[8]).toBe(
      'each value in "Phân loại 1" must be longer than or equal to 1 and shorter than or equal to 30 characters',
    );
    expect(await prisma.item.count({ where: { shopId: s.shopId } })).toBe(1);
  });

  it('refuses to import the same parent_sku twice', async () => {
    const s = await seller();
    const csv = `${HEADER}\nDUP-1,Đèn bàn,,500,,,,,250000,4,\n`;
    await upload(s, csv).expect(200);
    const again = await upload(s, csv).expect(200);
    expect(again.body).toMatchObject({ created: 0, failed: 1 });
    expect(again.body.results[0].error).toBe(
      'Product code already exists in your shop',
    );

    const other = await seller();
    const elsewhere = await upload(other, csv).expect(200);
    expect(elsewhere.body.created).toBe(1);
  });

  it('rejects unusable files as a whole', async () => {
    const s = await seller();
    await upload(s, 'parent_sku,name\nA,B\n').expect(400);
    await upload(s, `${HEADER}\n`).expect(400);
    await upload(s, `${HEADER}\nA,"broken`).expect(400);
    await upload(s, `${HEADER}\nA,B,,500,,,,,1,1,`, 'items.xlsx').expect(400);
    await http().post('/items/imports').set(bearer(s.token)).expect(400);

    const tooMany = [
      HEADER,
      ...Array.from(
        { length: 1001 },
        (_, i) => `P${i},Sp ${i},,500,,,,,1000,1,`,
      ),
    ];
    await upload(s, tooMany.join('\n')).expect(400);
    expect(await prisma.item.count({ where: { shopId: s.shopId } })).toBe(0);
  });

  it('requires an active shop', async () => {
    const csv = `${HEADER}\nX-1,Sản phẩm,,500,,,,,1000,1,\n`;
    const buyer = await signUp(app, emails);
    await upload(buyer, csv).expect(403);
    await upload(await seller(false), csv).expect(403);
    await http()
      .post('/items/imports')
      .attach('file', Buffer.from(csv), 'items.csv')
      .expect(401);
  });
});
