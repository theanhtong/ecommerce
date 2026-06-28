import {
  COD_PROVIDER,
  VNPAY_PROVIDER,
} from './interfaces/payment-provider.interface.js';

import { CodProvider } from './providers/cod.provider.js';
import { MockVnpayProvider } from './providers/mock-vnpay.provider.js';
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { VnpayProvider } from './providers/vnpay.provider.js';

@Module({
  imports: [OrdersModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    { provide: COD_PROVIDER, useClass: CodProvider },
    {
      provide: VNPAY_PROVIDER,
      useFactory: () => {
        return process.env.VNPAY_PROVIDER === 'sandbox'
          ? new VnpayProvider()
          : new MockVnpayProvider();
      },
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
