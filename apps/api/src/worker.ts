import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module.js';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
}
await bootstrap();
