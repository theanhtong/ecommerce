import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import {
  AdminPayoutsController,
  PayoutsController,
} from './payouts.controller.js';
import { PayoutsService } from './payouts.service.js';

@Module({
  imports: [AuthModule, LedgerModule],
  controllers: [PayoutsController, AdminPayoutsController],
  providers: [PayoutsService],
})
export class PayoutsModule {}
