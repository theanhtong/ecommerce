import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import pg from 'pg';

// Once before all e2e files: a migrated, empty test database; provinces and wards are kept.
export default async function setup() {
  if (existsSync('../../.env')) process.loadEnvFile('../../.env');
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for e2e tests');
  if (url === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not point at the dev database');
  }

  const dbName = new URL(url).pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName)) {
    throw new Error(`Unsafe test database name: ${dbName}`);
  }
  const server = new URL(url);
  server.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: server.toString() });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [dbName],
  );
  if (!exists.rowCount) await admin.query(`CREATE DATABASE "${dbName}"`);
  await admin.end();

  execFileSync(
    'pnpm',
    ['--filter', '@ecommerce/db', 'exec', 'prisma', 'migrate', 'deploy'],
    {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    },
  );

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  const { rows } = await db.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'provinces', 'wards')",
  );
  if (rows.length) {
    const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
    await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  await db.end();

  execFileSync('node', ['scripts/seed-regions.ts'], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
