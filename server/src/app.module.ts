import { AddressModule } from './address/address.module.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BrandsModule } from './brands/brands.module.js';
import { CartModule } from './cart/cart.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { ConfigModule } from '@nestjs/config';
import { CouponsModule } from './coupons/coupons.module.js';
import { MailModule } from './mail/mail.module.js';
import { Module } from '@nestjs/common';
import { OrdersModule } from './orders/orders.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProductsModule } from './products/products.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { ShipmentsModule } from './shipments/shipments.module.js';
import { UsersModule } from './users/users.module.js';

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
    UsersModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    ShipmentsModule,
    AddressModule,
    CouponsModule,
    ReviewsModule,
  ],
})
export class AppModule {}
