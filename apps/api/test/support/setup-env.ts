import { existsSync } from 'node:fs';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

// e2e tests never touch the dev database; global-setup has validated this URL.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
