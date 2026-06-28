import { Module, forwardRef } from '@nestjs/common';

import { GhnMockProvider } from './providers/ghn/ghn-mock.provider.js';
import { GhnProvider } from './providers/ghn/ghn.provider.js';
import { GhnSandboxProvider } from './providers/ghn/ghn-sandbox.provider.js';
import { GhnWebhookController } from './webhooks/ghn.controller.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { SHIPPING_PROVIDER } from './interfaces/shipping-provider.interface.js';
import { ShipmentsController } from './shipments.controller.js';
import { ShipmentsService } from './shipments.service.js';

const shippingProviderFactory = () => {
  switch (process.env.SHIPPING_PROVIDER) {
    case 'ghn':
      return new GhnProvider();
    case 'ghn-sandbox':
      return new GhnSandboxProvider();
    default:
      return new GhnMockProvider();
  }
};

@Module({
  imports: [OrdersModule, forwardRef(() => PaymentsModule)],
  controllers: [ShipmentsController, GhnWebhookController],
  providers: [
    ShipmentsService,
    {
      provide: SHIPPING_PROVIDER,
      useFactory: shippingProviderFactory,
    },
  ],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
