import type {
  CreateShippingOrderInput,
  IShippingProvider,
  ShippingOrderResult,
} from '../../interfaces/shipping-provider.interface.js';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GhnMockProvider implements IShippingProvider {
  private readonly logger = new Logger(GhnMockProvider.name);

  createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult> {
    const trackingNumber = `MOCK-GHN-${Date.now()}`;
    this.logger.log('─────────────────────────────────');
    this.logger.log(`MOCK GHN - Order: ${input.orderNumber}`);
    this.logger.log(`To: ${input.toName} - ${input.toPhone}`);
    this.logger.log(
      `Address: ${input.toAddress}, ${input.toWardName}, ${input.toDistrictName}, ${input.toProvinceName}`,
    );
    this.logger.log(`Tracking: ${trackingNumber}`);
    this.logger.log('─────────────────────────────────');

    return Promise.resolve({
      trackingNumber,
      expectedDeliveryAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      fee: 30000,
    });
  }

  cancelOrder(trackingNumber: string): Promise<void> {
    this.logger.log(`MOCK GHN - Cancel: ${trackingNumber}`);
    return Promise.resolve();
  }

  getOrderStatus(trackingNumber: string): Promise<string> {
    this.logger.log(`MOCK GHN - Get status: ${trackingNumber}`);
    return Promise.resolve('ready_to_pick');
  }
}
