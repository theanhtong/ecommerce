import type {
  CalculateFeeInput,
  CreateShippingOrderInput,
  IShippingProvider,
  ShippingOrderResult,
} from '../../interfaces/shipping-provider.interface.js';
import { Injectable, InternalServerErrorException } from '@nestjs/common';

@Injectable()
export class GhnSandboxProvider implements IShippingProvider {
  private readonly token = process.env.GHN_TOKEN as string;
  private readonly shopId = process.env.GHN_SHOP_ID as string;
  private readonly apiUrl =
    'https://dev-online-gateway.ghn.vn/shiip/public-api';

  private get headers() {
    return {
      'Content-Type': 'application/json',
      Token: this.token,
      ShopId: this.shopId,
    };
  }

  async createOrder(
    input: CreateShippingOrderInput,
  ): Promise<ShippingOrderResult> {
    const res = await fetch(`${this.apiUrl}/v2/shipping-order/create`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        to_name: input.toName,
        to_phone: input.toPhone,
        to_address: input.toAddress,
        to_ward_name: input.toWardName,
        to_district_name: input.toDistrictName,
        to_province_name: input.toProvinceName,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        cod_amount: input.codAmount,
        insurance_value: input.insuranceValue,
        note: input.note,
        items: input.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          weight: item.weight,
        })),
        service_type_id: Number(process.env.GHN_SERVICE_TYPE_ID) || 2,
        payment_type_id: Number(process.env.GHN_PAYMENT_TYPE_ID) || 1,
        required_note: process.env.GHN_REQUIRED_NOTE ?? 'KHONGCHOXEMHANG',
        client_order_code: input.orderNumber,
      }),
    });

    const data = (await res.json()) as {
      code: number;
      message: string;
      data?: {
        order_code: string;
        expected_delivery_time: string;
        total_fee: number;
      };
    };

    if (data.code !== 200 || !data.data) {
      throw new InternalServerErrorException(
        `GHN sandbox error: ${data.message}`,
      );
    }

    return {
      trackingNumber: data.data.order_code,
      expectedDeliveryAt: new Date(data.data.expected_delivery_time),
      fee: data.data.total_fee,
    };
  }

  async calculateFee(input: CalculateFeeInput): Promise<number> {
    const res = await fetch(`${this.apiUrl}/v2/shipping-order/fee`, {
      method: 'GET',
      headers: this.headers,
      body: JSON.stringify({
        service_type_id: Number(process.env.GHN_SERVICE_TYPE_ID) || 2,
        to_district_id: input.toDistrictId,
        to_ward_code: input.toWardCode,
        weight: input.weight,
        length: input.length,
        width: input.width,
        height: input.height,
        insurance_value: input.insuranceValue ?? 0,
        cod_failed_amount: input.codAmount ?? 0,
      }),
    });

    const data = (await res.json()) as {
      code: number;
      message: string;
      data?: { total: number };
    };

    if (data.code !== 200 || !data.data) {
      throw new InternalServerErrorException(`GHN fee error: ${data.message}`);
    }

    return data.data.total;
  }

  async cancelOrder(trackingNumber: string): Promise<void> {
    const res = await fetch(`${this.apiUrl}/v2/switch-status/cancel`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ order_codes: [trackingNumber] }),
    });

    const data = (await res.json()) as { code: number; message: string };
    if (data.code !== 200) {
      throw new InternalServerErrorException(
        `GHN sandbox cancel error: ${data.message}`,
      );
    }
  }

  async getOrderStatus(trackingNumber: string): Promise<string> {
    const res = await fetch(`${this.apiUrl}/v2/shipping-order/detail`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ order_code: trackingNumber }),
    });

    const data = (await res.json()) as {
      code: number;
      message: string;
      data?: { status: string };
    };

    if (data.code !== 200 || !data.data) {
      throw new InternalServerErrorException(
        `GHN sandbox error: ${data.message}`,
      );
    }

    return data.data.status;
  }
}
