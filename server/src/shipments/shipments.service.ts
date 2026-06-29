import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import {
  type IShippingProvider,
  SHIPPING_PROVIDER,
} from './interfaces/shipping-provider.interface.js';
import { GHN_STATUS_MAP } from './helpers/ghn-status.map.js';
import { CreateShipmentDto } from './dto/create-shipment.dto.js';
import { AddTrackingDto } from './dto/add-tracking.dto.js';
import {
  OrderStatus,
  PaymentMethod,
  ShipmentStatus,
} from '../generated/prisma/enums.js';
import { toNumber } from '../common/helpers/price.hepler.js';

@Injectable()
export class ShipmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    @Inject(SHIPPING_PROVIDER)
    private readonly shippingProvider: IShippingProvider,
  ) {}

  async createShipment(orderId: string, dto: CreateShipmentDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true, address: true, items: true, payment: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('Order must be CONFIRMED');
    }
    if (order.shipment)
      throw new BadRequestException('Shipment already exists');
    if (!order.address) throw new BadRequestException('Order has no address');

    const totalWeight = dto.weight ?? order.items.reduce((sum) => sum + 500, 0);

    const result = await this.shippingProvider.createOrder({
      toName: order.address.fullName,
      toPhone: order.address.phone,
      toAddress: order.address.addressLine,
      toProvinceName: order.address.provinceName,
      toDistrictName: order.address.districtName,
      toWardName: order.address.wardName,
      weight: totalWeight,
      length: (dto.length ?? Number(process.env.GHN_DEFAULT_LENGTH)) || 20,
      width: (dto.width ?? Number(process.env.GHN_DEFAULT_WIDTH)) || 20,
      height: (dto.height ?? Number(process.env.GHN_DEFAULT_HEIGHT)) || 10,
      codAmount:
        order.payment?.method === PaymentMethod.COD ? toNumber(order.total) : 0,
      note: dto.note ?? order.notes ?? undefined,
      insuranceValue: Number(process.env.GHN_INSURANCE_VALUE) || 0,
      orderNumber: order.orderNumber,
      items: order.items.map((item) => ({
        name: (item.variantSnapshot as { productName: string }).productName,
        quantity: item.quantity,
        weight: Number(process.env.GHN_DEFAULT_ITEM_WEIGHT) || 500,
      })),
    });

    const shipment = await this.prisma.shipment.create({
      data: {
        id: uuidv7(),
        orderId,
        carrier: process.env.SHIPPING_PROVIDER ?? 'mock',
        trackingNumber: result.trackingNumber,
        status: ShipmentStatus.PENDING,
        estimatedDeliveryAt: result.expectedDeliveryAt,
        trackingHistory: {
          create: {
            id: uuidv7(),
            status: ShipmentStatus.PENDING,
            description: 'Shipment created',
          },
        },
      },
      include: { trackingHistory: { orderBy: { createdAt: 'asc' } } },
    });

    await this.ordersService.updateStatus(orderId, {
      status: OrderStatus.SHIPPED,
    });

    return shipment;
  }

  async addTracking(shipmentId: string, dto: AddTrackingDto) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    const tracking = await this.prisma.shipmentTracking.create({
      data: {
        id: uuidv7(),
        shipmentId,
        status: dto.status,
        description: dto.description,
        location: dto.location,
      },
    });

    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: dto.status,
        deliveredAt:
          dto.status === ShipmentStatus.DELIVERED ? new Date() : undefined,
      },
    });

    if (dto.status === ShipmentStatus.DELIVERED) {
      await this.ordersService.updateStatus(shipment.orderId, {
        status: OrderStatus.DELIVERED,
      });
      await this.paymentsService.markCodPaid(shipment.orderId);
    }

    if (
      dto.status === ShipmentStatus.FAILED ||
      dto.status === ShipmentStatus.RETURNED
    ) {
      await this.ordersService.cancelOrder(
        shipment.order.userId,
        shipment.orderId,
      );
    }

    return tracking;
  }

  async syncStatus(shipmentId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');
    if (!shipment.trackingNumber)
      throw new BadRequestException('No tracking number');

    const ghnStatus = await this.shippingProvider.getOrderStatus(
      shipment.trackingNumber,
    );
    const mappedStatus = GHN_STATUS_MAP[ghnStatus];

    if (!mappedStatus || mappedStatus === shipment.status) {
      return { message: 'No status change', current: shipment.status };
    }

    return this.addTracking(shipmentId, {
      status: mappedStatus,
      description: ghnStatus,
    });
  }

  async getShipment(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');

    const shipment = await this.prisma.shipment.findUnique({
      where: { orderId },
      include: { trackingHistory: { orderBy: { createdAt: 'asc' } } },
    });
    if (!shipment) throw new NotFoundException('Shipment not found');

    return shipment;
  }

  async findByTrackingNumber(trackingNumber: string) {
    return this.prisma.shipment.findFirst({ where: { trackingNumber } });
  }
}
