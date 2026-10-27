import { existsSync } from 'node:fs';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

if (existsSync('../../.env')) process.loadEnvFile('../../.env');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: new ConsoleLogger({ json: process.env.NODE_ENV === 'production' }),
  });
  configureApp(app);
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Marketplace API')
        .addBearerAuth()
        .addSecurityRequirements('bearer')
        .build(),
    ),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
