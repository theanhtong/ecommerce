import { existsSync } from 'node:fs';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// e2e tests never touch the dev database; global-setup has validated this URL.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Never the developer's real bank settings.
process.env.SEPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SEPAY_BANK = 'MB';
process.env.SEPAY_ACCOUNT = '0000000000';
// Uploaded test files land in their own bucket.
process.env.MINIO_BUCKET = process.env.TEST_MINIO_BUCKET;
// Tests time the simulated carrier in real hours, whatever the demo speed-up.
process.env.CARRIER_TIME_SCALE = '1';
