import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { ConfigModule } from '@nestjs/config';
import { MailModule } from './mail/mail.module.js';
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  controllers: [AppController],
  providers: [AppService],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BrandsModule,
    CategoriesModule,
    PrismaModule,
    ProductsModule,
    AuthModule,
    MailModule,
  ],
})
export class AppModule {}
