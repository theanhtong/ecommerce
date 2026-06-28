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
  note?: string;
  orderNumber: string;
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
}

export const SHIPPING_PROVIDER = 'SHIPPING_PROVIDER';
