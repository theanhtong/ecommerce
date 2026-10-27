import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AdminVouchersController,
  VouchersController,
} from './vouchers.controller.js';
import { FlashSalesController } from './flash-sales.controller.js';
import { FlashSalesService } from './flash-sales.service.js';
import { VouchersService } from './vouchers.service.js';

@Module({
  imports: [AuthModule],
  controllers: [
    VouchersController,
    AdminVouchersController,
    FlashSalesController,
  ],
  providers: [VouchersService, FlashSalesService],
  exports: [VouchersService],
})
export class PromotionsModule {}
