export interface ShippingItem {
  name: string;
  quantity: number;
  weight: number;
}

export interface CreateShippingOrderInput {
  toName: string;
  toPhone: string;
  toAddress: string;
  toProvinceName: string;
  toDistrictName: string;
  toWardName: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  codAmount: number;
  insuranceValue?: number;
  note?: string;
  orderNumber: string;
  items: ShippingItem[];
}

export interface CalculateFeeInput {
  toDistrictId: number;
  toWardCode: string;
  weight: number;
  length: number;
  width: number;
  height: number;
  insuranceValue?: number;
  codAmount?: number;
}

export interface ShippingOrderResult {
  trackingNumber: string;
  expectedDeliveryAt?: Date;
  fee: number;
}

export interface IShippingProvider {
  createOrder(input: CreateShippingOrderInput): Promise<ShippingOrderResult>;
  cancelOrder(trackingNumber: string): Promise<void>;
  getOrderStatus(trackingNumber: string): Promise<string>;
  calculateFee(input: CalculateFeeInput): Promise<number>;
}

export const SHIPPING_PROVIDER = 'SHIPPING_PROVIDER';
