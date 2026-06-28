import * as crypto from 'crypto';

import type {
  CreatePaymentInput,
  IPaymentProvider,
  PaymentResult,
  VerifyResult,
} from '../interfaces/payment-provider.interface.js';

import { Injectable } from '@nestjs/common';

@Injectable()
export class VnpayProvider implements IPaymentProvider {
  private readonly tmnCode = process.env.VNPAY_TMN_CODE as string;
  private readonly secretKey = process.env.VNPAY_SECRET_KEY as string;
  private readonly vnpUrl =
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';

  createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const date = new Date();
    const createDate = date
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);

    const params: Record<string, string> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: String(input.amount * 100),
      vnp_CreateDate: createDate,
      vnp_CurrCode: 'VND',
      vnp_IpAddr: input.ipAddress,
      vnp_Locale: 'vn',
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: input.returnUrl,
      vnp_TxnRef: input.orderId,
    };

    const sortedParams = Object.fromEntries(
      Object.entries(params).sort(([a], [b]) => a.localeCompare(b)),
    );

    const signData = new URLSearchParams(sortedParams).toString();
    const hmac = crypto.createHmac('sha512', this.secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    const paymentUrl = `${this.vnpUrl}?${signData}&vnp_SecureHash=${signed}`;

    return Promise.resolve({
      paymentUrl,
      transactionId: input.orderId,
      isPaid: false,
    });
  }

  verifyCallback(query: Record<string, string>): Promise<VerifyResult> {
    const secureHash = query['vnp_SecureHash'];
    const params = { ...query };
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    const sortedParams = Object.fromEntries(
      Object.entries(params).sort(([a], [b]) => a.localeCompare(b)),
    );

    const signData = new URLSearchParams(sortedParams).toString();
    const hmac = crypto.createHmac('sha512', this.secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    const isValid = signed === secureHash;

    return Promise.resolve({
      isSuccess: isValid && query['vnp_ResponseCode'] === '00',
      transactionId: query['vnp_TransactionNo'] ?? '',
      orderId: query['vnp_TxnRef'] ?? '',
    });
  }
}
