// Seeds the test database for the flash sale load test: one shop, one flash sale and
// BUYERS buyers who each have an address and a signed access token, ready to "buy now".
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import pg from 'pg';

process.loadEnvFile('../../.env');

const BUYERS = Number(process.env.BUYERS ?? 500);
const QUOTA = Number(process.env.QUOTA ?? 50);
const url = process.env.TEST_DATABASE_URL;
if (!url || url === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set and differ from DATABASE_URL');
}

const db = new pg.Client({ connectionString: url });
await db.connect();
const one = async (sql: string, params: unknown[] = []) =>
  (await db.query<{ id: string }>(sql, params)).rows[0].id;

await db.query('BEGIN');
await db.query(
  "DELETE FROM orders WHERE buyer_id IN (SELECT id FROM users WHERE email LIKE 'load-%')",
);
await db.query(
  "DELETE FROM checkouts WHERE buyer_id IN (SELECT id FROM users WHERE email LIKE 'load-%')",
);
await db.query(
  "DELETE FROM items WHERE shop_id IN (SELECT s.id FROM shops s JOIN users u ON u.id = s.owner_id WHERE u.email LIKE 'load-%')",
);
await db.query(
  "DELETE FROM shops WHERE owner_id IN (SELECT id FROM users WHERE email LIKE 'load-%')",
);
await db.query("DELETE FROM users WHERE email LIKE 'load-%'");

const user = (email: string) =>
  one(
    `INSERT INTO users (id, email, password_hash, username, updated_at)
     VALUES (gen_random_uuid(), $1, 'unused', $2, now()) RETURNING id`,
    [email, `load_${randomUUID().replaceAll('-', '').slice(0, 12)}`],
  );
const sellerId = await user('load-seller@load.test');
const shopId = await one(
  `INSERT INTO shops (id, owner_id, name, status, contact_name, phone, ward_code, street, updated_at)
   VALUES (gen_random_uuid(), $1, 'Load Test Shop', 'active', 'Kho', '+84901234567', '00004', '1 Kho', now())
   RETURNING id`,
  [sellerId],
);
const itemId = await one(
  `INSERT INTO items (id, shop_id, name, weight, updated_at)
   VALUES (gen_random_uuid(), $1, 'Load test item', 300, now()) RETURNING id`,
  [shopId],
);
const modelId = await one(
  `INSERT INTO models (id, item_id, tier_index, price, updated_at)
   VALUES (gen_random_uuid(), $1, '{}', 100000, now()) RETURNING id`,
  [itemId],
);
await db.query(
  'INSERT INTO inventory (model_id, on_hand, updated_at) VALUES ($1, 10000, now())',
  [modelId],
);
const promotionId = await one(
  `INSERT INTO promotions (id, type, shop_id, name, starts_at, ends_at)
   VALUES (gen_random_uuid(), 'flash_sale', $1, 'Load test', now() - interval '1 minute', now() + interval '1 hour')
   RETURNING id`,
  [shopId],
);
const flashSaleId = await one(
  `INSERT INTO flash_sale_models (id, promotion_id, model_id, price, quota, purchase_limit)
   VALUES (gen_random_uuid(), $1, $2, 50000, $3, 1) RETURNING id`,
  [promotionId, modelId, QUOTA],
);

const jwt = new JwtService({
  secret: process.env.JWT_ACCESS_SECRET,
  signOptions: { expiresIn: 3600, algorithm: 'HS256' },
});
const buyers = [];
for (let i = 0; i < BUYERS; i++) {
  const buyerId = await user(`load-buyer-${i}@load.test`);
  const addressId = await one(
    `INSERT INTO addresses (id, user_id, recipient_name, phone, ward_code, street, is_default, updated_at)
     VALUES (gen_random_uuid(), $1, 'Load', '+84912345678', '00004', '1 Load', true, now()) RETURNING id`,
    [buyerId],
  );
  buyers.push({
    token: await jwt.signAsync({
      sub: buyerId,
      role: 'user',
      sid: randomUUID(),
    }),
    addressId,
    flashSaleId,
    key: randomUUID(),
    // One address per buyer, as a proxy would report it.
    ip: `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
  });
}
await db.query('COMMIT');
await db.end();

mkdirSync('load/out', { recursive: true });
writeFileSync('load/out/buyers.json', JSON.stringify(buyers));
writeFileSync('load/out/model.json', JSON.stringify({ modelId, quota: QUOTA }));
console.log(
  `${BUYERS} buyers chase ${QUOTA} flash sale units of model ${modelId}`,
);
