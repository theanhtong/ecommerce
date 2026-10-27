import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import {
  AdminVouchersController,
  VouchersController,
} from './vouchers.controller.js';
import { VouchersService } from './vouchers.service.js';

@Module({
  imports: [AuthModule],
  controllers: [VouchersController, AdminVouchersController],
  providers: [VouchersService],
  exports: [VouchersService],
})
export class PromotionsModule {}
