import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { CheckoutService } from './checkout.service.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import {
  AdminReturnsController,
  ReturnsController,
} from './returns.controller.js';
import { ReturnsService } from './returns.service.js';

@Module({
  imports: [AuthModule, LedgerModule, PromotionsModule],
  controllers: [
    OrdersController,
    AdminOrdersController,
    ReturnsController,
    AdminReturnsController,
  ],
  providers: [CheckoutService, OrdersService, ReturnsService],
  exports: [OrdersService, ReturnsService],
})
export class OrdersModule {}
