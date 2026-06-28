import {
  IPaymentProvider,
  PaymentResult,
  VerifyResult,
} from '../interfaces/payment-provider.interface.js';

import { Injectable } from '@nestjs/common';

@Injectable()
export class CodProvider implements IPaymentProvider {
  createPayment(): Promise<PaymentResult> {
    return Promise.resolve({
      isPaid: false,
      paymentUrl: null,
      transactionId: null,
    });
  }

  verifyCallback(): Promise<VerifyResult> {
    return Promise.resolve({ isSuccess: true, transactionId: '', orderId: '' });
  }
}
