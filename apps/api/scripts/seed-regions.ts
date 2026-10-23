// Loads provinces and wards into DATABASE_URL. Upserts by code, so it is safe to re-run and never deletes rows.
import { existsSync, readFileSync } from 'node:fs';
import pg from 'pg';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const SEED_FILE = new URL(
  '../../../packages/db/prisma/seed/regions.sql',
  import.meta.url,
);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(readFileSync(SEED_FILE, 'utf8'));
    const { rows } = await db.query<{ provinces: number; wards: number }>(
      'SELECT (SELECT count(*) FROM provinces)::int AS provinces, (SELECT count(*) FROM wards)::int AS wards',
    );
    console.log(
      `regions: ${rows[0].provinces} provinces, ${rows[0].wards} wards`,
    );
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
