import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AddressesModule } from './modules/addresses/addresses.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { LedgerModule } from './modules/ledger/ledger.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { RegionsModule } from './modules/regions/regions.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { ShopsModule } from './modules/shops/shops.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ limit: 100, ttl: 60_000 }]),
    AuthModule,
    UsersModule,
    ShopsModule,
    CatalogModule,
    CartModule,
    RegionsModule,
    AddressesModule,
    OrdersModule,
    PaymentsModule,
    LedgerModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
