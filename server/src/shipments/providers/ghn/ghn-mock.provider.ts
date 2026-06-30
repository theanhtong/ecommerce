import type {
  CreateShippingOrderInput,
  IShippingProvider,
  ShippingOrderResult,
} from '../../interfaces/shipping-provider.interface.js';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class GhnMockProvider implements IShippingProvider {
  private readonly logger = new Logger(GhnMockProvider.name);

  private readonly MOCK_PROGRESSION = [
    'ready_to_pick',
    'picking',
    'picked',
    'storing',
    'transporting',
    'delivering',
    'delivered',
  ];

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
      fee: Number(process.env.GHN_MOCK_FEE) || 30000,
    });
  }

  calculateFee(): Promise<number> {
    this.logger.log('MOCK GHN - Calculate fee');
    return Promise.resolve(Number(process.env.GHN_MOCK_FEE) || 30000);
  }

  cancelOrder(trackingNumber: string): Promise<void> {
    this.logger.log(`MOCK GHN - Cancel: ${trackingNumber}`);
    return Promise.resolve();
  }

  getOrderStatus(trackingNumber: string): Promise<string> {
    const createdAt = Number(trackingNumber.replace('MOCK-GHN-', ''));
    const elapsedSeconds = (Date.now() - createdAt) / 1000;
    const secondsPerStep = Number(process.env.GHN_MOCK_STEP_SECONDS) || 30;

    const stepIndex = Math.min(
      Math.floor(elapsedSeconds / secondsPerStep),
      this.MOCK_PROGRESSION.length - 1,
    );

    const status = this.MOCK_PROGRESSION[stepIndex];
    this.logger.log(`MOCK GHN - Get status: ${trackingNumber} → ${status}`);
    return Promise.resolve(status);
  }
}
