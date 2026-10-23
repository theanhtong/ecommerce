import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CheckoutService } from './checkout.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [CheckoutService, OrdersService],
})
export class OrdersModule {}
