import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrdersService } from '../orders/orders.service.js';
import { buildPaginated } from '../common/helpers/pagination.helper.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import {
  type IPaymentProvider,
  COD_PROVIDER,
  VNPAY_PROVIDER,
} from './interfaces/payment-provider.interface.js';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../generated/prisma/enums.js';
import { toNumber } from '../common/helpers/price.hepler.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    @Inject(COD_PROVIDER) private readonly codProvider: IPaymentProvider,
    @Inject(VNPAY_PROVIDER) private readonly vnpayProvider: IPaymentProvider,
  ) {}

  async createPayment(
    userId: string,
    orderId: string,
    dto: CreatePaymentDto,
    ipAddress: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payment: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');

    // chỉ cho phép tạo payment khi CONFIRMED
    if (order.status !== OrderStatus.CONFIRMED) {
      throw new BadRequestException('Order must be CONFIRMED before payment');
    }

    // VNPAY: cho phép retry nếu payment trước đó FAILED
    if (order.payment) {
      if (order.payment.status === PaymentStatus.PAID) {
        throw new BadRequestException('Order already paid');
      }
      if (order.payment.status === PaymentStatus.PENDING) {
        throw new BadRequestException('Payment already pending');
      }
      // FAILED → xóa payment cũ để tạo mới (retry)
      await this.prisma.payment.delete({ where: { id: order.payment.id } });
    }

    const provider = this.getProvider(dto.method);

    const result = await provider.createPayment({
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: toNumber(order.total),
      orderInfo: `Thanh toan don hang ${order.orderNumber}`,
      returnUrl:
        dto.returnUrl ?? `${process.env.APP_URL}/payments/vnpay/return`,
      ipAddress,
    });

    const payment = await this.prisma.payment.create({
      data: {
        id: uuidv7(),
        orderId: order.id,
        method: dto.method,
        status: PaymentStatus.PENDING,
        amount: order.total,
        transactionId: result.transactionId,
      },
    });

    return { payment, paymentUrl: result.paymentUrl ?? null };
  }

  // VNPAY IPN - server to server (đáng tin cậy hơn return)
  async handleVnpayIpn(query: Record<string, string>) {
    const result = await this.vnpayProvider.verifyCallback(query);

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: result.orderId },
    });

    if (!payment) return { RspCode: '01', Message: 'Payment not found' };
    if (payment.status !== PaymentStatus.PENDING) {
      return { RspCode: '02', Message: 'Payment already processed' };
    }

    if (result.isSuccess) {
      await this.prisma.$transaction([
        this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            transactionId: result.transactionId,
            paidAt: new Date(),
          },
        }),
        this.prisma.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: PaymentStatus.PAID },
        }),
      ]);
      return { RspCode: '00', Message: 'Success' };
    }

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.FAILED },
    });

    return { RspCode: '00', Message: 'Confirmed failure' };
  }

  // VNPAY return - chỉ để redirect UI, không update DB
  async handleVnpayReturn(query: Record<string, string>) {
    const result = await this.vnpayProvider.verifyCallback(query);
    return {
      isSuccess: result.isSuccess,
      orderId: result.orderId,
      message: result.isSuccess ? 'Payment successful' : 'Payment failed',
    };
  }

  // COD paid - gọi khi shipment DELIVERED
  async markCodPaid(orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });
    if (!payment || payment.method !== PaymentMethod.COD) return;
    if (payment.status === PaymentStatus.PAID) return;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { orderId },
        data: { status: PaymentStatus.PAID, paidAt: new Date() },
      }),
      this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.PAID },
      }),
    ]);
  }

  async getPayment(userId: string, orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
      include: { order: { select: { userId: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.order.userId !== userId)
      throw new ForbiddenException('Access denied');
    return payment;
  }

  async findAll(query: PaginationDto) {
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { order: { select: { orderNumber: true, userId: true } } },
      }),
      this.prisma.payment.count(),
    ]);
    return buildPaginated(data, total, query.page, query.limit);
  }

  private getProvider(method: PaymentMethod): IPaymentProvider {
    switch (method) {
      case PaymentMethod.COD:
        return this.codProvider;
      case PaymentMethod.VNPAY:
        return this.vnpayProvider;
      default:
        throw new BadRequestException(`Payment method ${method} not supported`);
    }
  }
}
