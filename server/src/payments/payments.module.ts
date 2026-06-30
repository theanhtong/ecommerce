import {
  COD_PROVIDER,
  VNPAY_PROVIDER,
} from './interfaces/payment-provider.interface.js';
import { Module, forwardRef } from '@nestjs/common';

import { CodProvider } from './providers/cod.provider.js';
import { MockVnpayProvider } from './providers/mock-vnpay.provider.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsAdminController } from './payments-admin.controller.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { PaymentsWebhookController } from './payments-webhook.controller.js';
import { VnpayProvider } from './providers/vnpay.provider.js';

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [
    PaymentsController,
    PaymentsWebhookController,
    PaymentsAdminController,
  ],
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
