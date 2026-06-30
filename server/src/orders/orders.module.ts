import { Module, forwardRef } from '@nestjs/common';

import { CartModule } from '../cart/cart.module.js';
import { CouponsModule } from '../coupons/coupons.module.js';
import { GhnMockProvider } from '../shipments/providers/ghn/ghn-mock.provider.js';
import { GhnSandboxProvider } from '../shipments/providers/ghn/ghn-sandbox.provider.js';
import { InventoryModule } from '../inventories/inventory.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { OrdersAdminController } from './orders-admin.controller.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { PaymentsModule } from '../payments/payments.module.js';
import { SHIPPING_PROVIDER } from '../shipments/interfaces/shipping-provider.interface.js';
import { ShipmentsModule } from '../shipments/shipments.module.js';

const shippingFeeProviderFactory = () => {
  switch (process.env.SHIPPING_PROVIDER) {
    case 'ghn-sandbox':
      return new GhnSandboxProvider();
    default:
      return new GhnMockProvider();
  }
};

@Module({
  imports: [
    InventoryModule,
    CartModule,
    CouponsModule,
    NotificationsModule,
    forwardRef(() => PaymentsModule),
    forwardRef(() => ShipmentsModule),
  ],
  controllers: [OrdersController, OrdersAdminController],
  providers: [
    OrdersService,
    {
      provide: SHIPPING_PROVIDER,
      useFactory: shippingFeeProviderFactory,
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
