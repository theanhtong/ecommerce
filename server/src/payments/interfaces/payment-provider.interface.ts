export interface CreatePaymentInput {
  orderId: string;
  orderNumber: string;
  amount: number;
  orderInfo: string;
  returnUrl: string;
  ipAddress: string;
}

export interface PaymentResult {
  paymentUrl?: string | null;
  transactionId?: string | null;
  isPaid: boolean;
}

export interface VerifyResult {
  isSuccess: boolean;
  transactionId: string;
  orderId: string;
}

export interface IPaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  verifyCallback(query: Record<string, string>): Promise<VerifyResult>;
}

export const COD_PROVIDER = 'COD_PROVIDER';
export const VNPAY_PROVIDER = 'VNPAY_PROVIDER';
