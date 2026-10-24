import { existsSync } from 'node:fs';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// e2e tests never touch the dev database; global-setup has validated this URL.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Never the developer's real bank settings.
process.env.SEPAY_WEBHOOK_SECRET = 'test-webhook-secret';
process.env.SEPAY_BANK = 'MB';
process.env.SEPAY_ACCOUNT = '0000000000';
