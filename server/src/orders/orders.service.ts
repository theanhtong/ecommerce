import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '../generated/prisma/client.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateOrderStatusDto } from './dto/update-order.dto.js';
import { buildPaginated } from '../common/helpers/pagination.helper.js';
import { generateOrderNumber } from './helpers/order-number.helper.js';
import { isValidTransition } from './helpers/order-transition.helper.js';
import { toNumber } from '../common/helpers/price.hepler.js';
import { uuidv7 } from 'uuidv7';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ORDER_NOTIFICATION_MAP } from './helpers/order-notification.map.js';
import {
  SHIPPING_PROVIDER,
  type IShippingProvider,
} from '../shipments/interfaces/shipping-provider.interface.js';
import { CouponsService } from '../coupons/coupons.service.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly couponsService: CouponsService,
    private readonly notificationsService: NotificationsService,
    @Inject(SHIPPING_PROVIDER)
    private readonly shippingProvider: IShippingProvider,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto) {
    const address = await this.prisma.address.findUnique({
      where: { id: dto.addressId },
    });
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId)
      throw new ForbiddenException('Access denied');

    const cartItems = await this.prisma.cartItem.findMany({
      where: {
        id: { in: dto.cartItemIds },
        cart: { userId },
      },
      include: {
        variant: {
          include: {
            product: { select: { name: true, slug: true } },
            images: { orderBy: { order: 'asc' }, take: 1 },
            inventory: true,
          },
        },
      },
    });

    if (cartItems.length === 0)
      throw new BadRequestException('No valid cart items found');
    if (cartItems.length !== dto.cartItemIds.length) {
      throw new BadRequestException('Some cart items are invalid');
    }

    for (const item of cartItems) {
      const available =
        (item.variant.inventory?.quantity ?? 0) -
        (item.variant.inventory?.reservedQuantity ?? 0);
      if (available < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for SKU "${item.variant.sku}". Available: ${available}`,
        );
      }
    }

    const subtotal = cartItems.reduce((sum, item) => {
      return (
        sum +
        toNumber(item.variant.salePrice ?? item.variant.price) * item.quantity
      );
    }, 0);

    let couponId: string | null = null;
    let discountAmount = 0;

    if (dto.couponCode) {
      const result = await this.couponsService.applyToOrder(
        userId,
        dto.couponCode,
        subtotal,
      );
      couponId = result.coupon.id;
      discountAmount = result.discountAmount;
    }

    const totalWeight = cartItems.reduce(
      (sum) => sum + (Number(process.env.GHN_DEFAULT_ITEM_WEIGHT) || 500),
      0,
    );

    const shippingFee = await this.shippingProvider.calculateFee({
      toDistrictId: address.districtId,
      toWardCode: address.wardCode,
      weight: totalWeight,
      length: Number(process.env.GHN_DEFAULT_LENGTH) || 20,
      width: Number(process.env.GHN_DEFAULT_WIDTH) || 20,
      height: Number(process.env.GHN_DEFAULT_HEIGHT) || 10,
      insuranceValue: Number(process.env.GHN_INSURANCE_VALUE) || 0,
      codAmount: 0,
    });

    const total = subtotal - discountAmount + shippingFee;

    const shippingSnapshot = {
      fullName: address.fullName,
      phone: address.phone,
      addressLine: address.addressLine,
      provinceName: address.provinceName,
      districtName: address.districtName,
      wardName: address.wardName,
    };

    return this.prisma.$transaction(
      async (tx) => {
        const variantIds = cartItems.map((i) => i.variantId);
        await tx.$executeRaw`
          SELECT id FROM inventories
          WHERE "variantId" = ANY(${variantIds}::uuid[])
          FOR UPDATE
        `;

        const inventories = await tx.inventory.findMany({
          where: { variantId: { in: variantIds } },
        });

        for (const item of cartItems) {
          const inv = inventories.find((i) => i.variantId === item.variantId);
          const available = (inv?.quantity ?? 0) - (inv?.reservedQuantity ?? 0);
          if (available < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for SKU "${item.variant.sku}"`,
            );
          }
        }

        const orderId = uuidv7();
        const order = await tx.order.create({
          data: {
            id: orderId,
            orderNumber: generateOrderNumber(),
            userId,
            addressId: dto.addressId,
            couponId,
            subtotal,
            discountAmount,
            shippingFee,
            total,
            shippingSnapshot,
            notes: dto.notes,
            items: {
              create: cartItems.map((item) => ({
                id: uuidv7(),
                variantId: item.variantId,
                quantity: item.quantity,
                unitPrice: toNumber(
                  item.variant.salePrice ?? item.variant.price,
                ),
                total:
                  toNumber(item.variant.salePrice ?? item.variant.price) *
                  item.quantity,
                variantSnapshot: {
                  sku: item.variant.sku,
                  price: toNumber(item.variant.price),
                  salePrice: item.variant.salePrice
                    ? toNumber(item.variant.salePrice)
                    : null,
                  color: item.variant.color,
                  productName: item.variant.product.name,
                  productSlug: item.variant.product.slug,
                  imageUrl: item.variant.images[0]?.url ?? null,
                },
              })),
            },
          },
          include: { items: true },
        });

        for (const item of cartItems) {
          await tx.inventory.update({
            where: { variantId: item.variantId },
            data: { reservedQuantity: { increment: item.quantity } },
          });
        }

        if (couponId) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { usedCount: { increment: 1 } },
          });
          await tx.couponUsage.create({
            data: {
              id: uuidv7(),
              couponId,
              userId,
              orderId,
            },
          });
        }

        await tx.cartItem.deleteMany({
          where: { id: { in: dto.cartItemIds } },
        });

        const notif = ORDER_NOTIFICATION_MAP[OrderStatus.PENDING];
        if (notif) {
          await this.notificationsService.create({
            userId,
            type: notif.type,
            title: notif.title,
            body: `Đơn hàng #${order.orderNumber} đã được tạo`,
          });
        }

        return order;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 10000,
      },
    );
  }

  async getMyOrders(userId: string, query: PaginationDto) {
    const where = { userId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { items: true, payment: true, shipment: true },
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginated(data, total, query.page, query.limit);
  }

  async getMyOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        payment: true,
        shipment: { include: { trackingHistory: true } },
        coupon: {
          select: { code: true, discountType: true, discountValue: true },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');

    return order;
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.userId !== userId) throw new ForbiddenException('Access denied');

    if (!isValidTransition(order.status, OrderStatus.CANCELLED)) {
      throw new BadRequestException(
        `Cannot cancel order with status ${order.status}`,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        for (const item of order.items) {
          if (item.variantId) {
            await tx.inventory.update({
              where: { variantId: item.variantId },
              data: { reservedQuantity: { decrement: item.quantity } },
            });
          }
        }

        if (order.couponId) {
          await tx.coupon.update({
            where: { id: order.couponId },
            data: { usedCount: { decrement: 1 } },
          });
          await tx.couponUsage.deleteMany({ where: { orderId } });
        }

        const notif = ORDER_NOTIFICATION_MAP[OrderStatus.CANCELLED];
        if (notif) {
          await this.notificationsService.create({
            userId: order.userId,
            type: notif.type,
            title: notif.title,
            body: `Đơn hàng #${order.orderNumber} đã được hủy`,
          });
        }

        return tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findAll(query: PaginationDto) {
    const where = {
      ...(query.search && {
        orderNumber: { contains: query.search, mode: 'insensitive' as const },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          items: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return buildPaginated(data, total, query.page, query.limit);
  }

  async updateStatus(orderId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!isValidTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}`,
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        if (dto.status === OrderStatus.DELIVERED) {
          for (const item of order.items) {
            if (item.variantId) {
              await tx.inventory.update({
                where: { variantId: item.variantId },
                data: {
                  quantity: { decrement: item.quantity },
                  reservedQuantity: { decrement: item.quantity },
                },
              });
            }
          }
        }

        if (dto.status === OrderStatus.CANCELLED) {
          for (const item of order.items) {
            if (item.variantId) {
              await tx.inventory.update({
                where: { variantId: item.variantId },
                data: { reservedQuantity: { decrement: item.quantity } },
              });
            }
          }

          if (order.couponId) {
            await tx.coupon.update({
              where: { id: order.couponId },
              data: { usedCount: { decrement: 1 } },
            });
            await tx.couponUsage.deleteMany({ where: { orderId } });
          }
        }

        const notif = ORDER_NOTIFICATION_MAP[dto.status];
        if (notif) {
          await this.notificationsService.create({
            userId: order.userId,
            type: notif.type,
            title: notif.title,
            body: `Đơn hàng #${order.orderNumber}`,
          });
        }

        return tx.order.update({
          where: { id: orderId },
          data: { status: dto.status },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
