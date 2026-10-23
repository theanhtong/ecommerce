// Resets the dev database (keeps admins) and drives the marketplace flow through the running API.
import { existsSync } from 'node:fs';
import pg from 'pg';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const API =
  process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
const PASSWORD = 'demo password 123';
const BUYER = { email: 'buyer@demo.vn', username: 'demo_buyer' };
const SELLER = { email: 'seller@demo.vn', username: 'demo_seller' };

interface CallOptions {
  token?: string;
  body?: unknown;
}

async function call(
  method: string,
  path: string,
  expected: number,
  { token, body }: CallOptions = {},
) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  const ok = res.status === expected;
  console.log(
    `  ${ok ? '✓' : '✗'} ${method.padEnd(5)} ${path} → ${res.status}`,
  );
  if (!ok) {
    throw new Error(`Expected ${expected}, got ${res.status}: ${text}`);
  }
  return json;
}

const step = (title: string) => console.log(`\n${title}`);

async function resetDatabase() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    const shops = await db.query('DELETE FROM shops');
    const users = await db.query("DELETE FROM users WHERE role <> 'admin'");
    await db.query('COMMIT');
    console.log(
      `  deleted ${shops.rowCount} shops, ${users.rowCount} non-admin users (and their sessions)`,
    );
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

async function main() {
  const adminEmail = process.env.DEMO_ADMIN_EMAIL;
  const adminPassword = process.env.DEMO_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) {
    throw new Error('Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD in .env');
  }
  try {
    await fetch(API);
  } catch {
    throw new Error(
      `API is not reachable at ${API}; start it with pnpm dev:api`,
    );
  }

  step('0. Reset dev database');
  await resetDatabase();

  step('1. Buyer and seller register');
  const buyer = await call('POST', '/auth/register', 201, {
    body: { ...BUYER, password: PASSWORD },
  });
  const seller = await call('POST', '/auth/register', 201, {
    body: { ...SELLER, password: PASSWORD },
  });

  step('2. Seller opens a shop (pending review)');
  const shop = await call('POST', '/shops', 201, {
    token: seller.accessToken,
    body: { name: 'Cửa Hàng Demo', description: 'Đồ gỗ thủ công' },
  });
  await call('GET', `/shops/${shop.id}`, 404);

  step('3. Admin logs in and approves the shop');
  const admin = await call('POST', '/auth/login', 200, {
    body: { email: adminEmail, password: adminPassword },
  });
  await call('GET', '/admin/shops?status=pending', 200, {
    token: admin.accessToken,
  });
  await call('PATCH', `/admin/shops/${shop.id}/status`, 200, {
    token: admin.accessToken,
    body: { status: 'active' },
  });

  step('4. Buyer sees the shop but cannot touch admin endpoints');
  await call('GET', `/shops/${shop.id}`, 200);
  await call('GET', '/users/me', 200, { token: buyer.accessToken });
  await call('GET', '/admin/users', 403, { token: buyer.accessToken });
  await call('PATCH', `/admin/shops/${shop.id}/status`, 403, {
    token: buyer.accessToken,
    body: { status: 'banned' },
  });

  step('5. Seller updates their own shop');
  await call('PATCH', '/shops/me', 200, {
    token: seller.accessToken,
    body: { description: 'Đồ gỗ thủ công, giao toàn quốc' },
  });

  console.log(
    `\nDone. Data is kept in the dev database; open it with pnpm --filter @ecommerce/db studio.`,
  );
  console.log(`  buyer  ${BUYER.email} / ${PASSWORD}`);
  console.log(`  seller ${SELLER.email} / ${PASSWORD}`);
  console.log(`  shop   ${API}/shops/${shop.id}`);
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
