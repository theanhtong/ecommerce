import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CarrierController } from './carrier.controller.js';
import { CheckoutService } from './checkout.service.js';
import { AdminOrdersController } from './admin-orders.controller.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [OrdersController, AdminOrdersController, CarrierController],
  providers: [CheckoutService, OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
