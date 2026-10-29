// Creates the admin account from DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD, or promotes and resets it if it exists.
import { existsSync } from 'node:fs';
import * as argon2 from 'argon2';
import pg from 'pg';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

const email = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.DEMO_ADMIN_PASSWORD;
if (!email || !password || password.length < 8) {
  throw new Error(
    'Set DEMO_ADMIN_EMAIL and DEMO_ADMIN_PASSWORD (8+ characters) in .env',
  );
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const { rows } = await db.query<{ created: boolean }>(
    `INSERT INTO users (id, email, password_hash, username, role, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'admin', 'admin', now())
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash, role = 'admin', status = 'active', updated_at = now()
     RETURNING (xmax = 0) AS created`,
    [email, await argon2.hash(password)],
  );
  console.log(`admin ${email} ${rows[0].created ? 'created' : 'updated'}`);
} finally {
  await db.end();
}
