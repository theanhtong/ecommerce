import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [AuthModule, LedgerModule, OrdersModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
