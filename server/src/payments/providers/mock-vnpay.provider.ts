import type {
  CreatePaymentInput,
  IPaymentProvider,
  PaymentResult,
  VerifyResult,
} from '../interfaces/payment-provider.interface.js';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MockVnpayProvider implements IPaymentProvider {
  private readonly logger = new Logger(MockVnpayProvider.name);

  createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const transactionId = `MOCK-${Date.now()}`;
    const paymentUrl = `${process.env.APP_URL}/payments/vnpay/return?vnp_ResponseCode=00&vnp_TxnRef=${input.orderId}&vnp_TransactionNo=${transactionId}`;

    this.logger.log('─────────────────────────────────');
    this.logger.log(`MOCK VNPAY - Order: ${input.orderNumber}`);
    this.logger.log(`Amount: ${input.amount.toLocaleString()}đ`);
    this.logger.log(`Payment URL: ${paymentUrl}`);
    this.logger.log('─────────────────────────────────');

    return Promise.resolve({ paymentUrl, transactionId, isPaid: false });
  }

  verifyCallback(query: Record<string, string>): Promise<VerifyResult> {
    return Promise.resolve({
      isSuccess: query['vnp_ResponseCode'] === '00',
      transactionId: query['vnp_TransactionNo'] ?? '',
      orderId: query['vnp_TxnRef'] ?? '',
    });
  }
}
