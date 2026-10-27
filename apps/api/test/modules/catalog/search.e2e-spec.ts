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

type Account = Awaited<ReturnType<typeof signUp>>;
type Hit = { id: string; name: string; sold: number };

describe('Item search (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  // Unique per run so other suites' items never match.
  const tag = `zq${randomUUID().slice(0, 6)}`;
  const ids: Record<'shirt' | 'jacket' | 'lamp', string> = {
    shirt: '',
    jacket: '',
    lamp: '',
  };

  const http = () => request(app.getHttpServer());
  const as = (account: Account) => ({
    post: (url: string, body: object) =>
      http().post(url).set(bearer(account.token)).send(body),
    patch: (url: string, body: object) =>
      http().patch(url).set(bearer(account.token)).send(body),
  });
  const search = async (query: string) =>
    (await http().get(`/items/search?${query}`).expect(200)).body as {
      items: Hit[];
      total: number;
      page: number;
      hasMore: boolean;
    };
  const names = (hits: Hit[]) =>
    hits.map((h) => Object.entries(ids).find(([, id]) => id === h.id)?.[0]);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await signUp(app, emails, 'admin');
    const s = await signUp(app, emails);
    const shop = await as(s)
      .post('/shops', { ...SHOP_ADDRESS, name: `Shop ${tag}` })
      .expect(201);
    await as(admin)
      .patch(`/admin/shops/${shop.body.id}/status`, { status: 'active' })
      .expect(200);
    const create = async (name: string, prices: number[]) =>
      (
        await as(s)
          .post('/items', {
            name: `${name} ${tag}`,
            weight: 300,
            tierVariations:
              prices.length > 1
                ? [{ name: 'Loại', options: prices.map((_, i) => `L${i}`) }]
                : [],
            models: prices.map((price, i) => ({
              tierIndex: prices.length > 1 ? [i] : [],
              price,
              stock: 5,
            })),
          })
          .expect(201)
      ).body.id as string;
    ids.shirt = await create('Áo thun cotton', [100000]);
    ids.jacket = await create('Áo khoác gió', [300000]);
    ids.lamp = await create('Đèn ngủ gỗ', [80000, 50000]);
  });

  afterAll(async () => {
    const users = { email: { in: emails } };
    await prisma.item.deleteMany({ where: { shop: { owner: users } } });
    await prisma.shop.deleteMany({ where: { owner: users } });
    await prisma.user.deleteMany({ where: users });
    await app.close();
  });

  it('matches without accents and ranks the closest name first', async () => {
    expect(names((await search(`q=ao thun ${tag}`)).items)[0]).toBe('shirt');
    expect(names((await search(`q=DEN NGU ${tag}`)).items)).toEqual(['lamp']);
    expect(names((await search(`q=khoác gió ${tag}`)).items)[0]).toBe('jacket');
    expect((await search(`q=${encodeURIComponent('%')}`)).total).toBe(0);
  });

  it('filters by the lowest model price and sorts by price', async () => {
    expect(names((await search(`q=${tag}&sort=price_asc`)).items)).toEqual([
      'lamp',
      'shirt',
      'jacket',
    ]);
    expect(names((await search(`q=${tag}&sort=price_desc`)).items)).toEqual([
      'jacket',
      'shirt',
      'lamp',
    ]);
    expect(
      names((await search(`q=${tag}&minPrice=60000&maxPrice=200000`)).items),
    ).toEqual(['shirt']);
    expect((await search(`q=${tag}&minRating=1`)).total).toBe(0);
  });

  it('pages through results', async () => {
    const first = await search(`q=${tag}&sort=newest&limit=2`);
    expect(first).toMatchObject({ total: 3, page: 1, hasMore: true });
    expect(names(first.items)).toEqual(['lamp', 'jacket']);
    const second = await search(`q=${tag}&sort=newest&limit=2&page=2`);
    expect(second).toMatchObject({ hasMore: false });
    expect(names(second.items)).toEqual(['shirt']);
    expect(second.items[0]).toMatchObject({ sold: 0, priceMin: 100000 });
    await http().get('/items/search?sort=cheapest').expect(400);
  });
});
