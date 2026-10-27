import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module.js';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  app.enableShutdownHooks();
}
await bootstrap();
