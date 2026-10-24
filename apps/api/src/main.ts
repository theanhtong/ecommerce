import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
