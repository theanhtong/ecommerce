import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryReason, OrderStatus, Prisma } from '@ecommerce/db';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ListOrdersQuery } from './dto/order.dto.js';
import { orderInclude, orderView } from './order-view.js';

type Party = 'buyer' | 'seller';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async listForBuyer(buyerId: string, query: ListOrdersQuery) {
    return this.list({ buyerId }, query);
  }

  async listForShop(ownerId: string, query: ListOrdersQuery) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return this.list({ shopId: shop.id }, query);
  }

  async get(userId: string, id: string) {
    const { order } = await this.involved(userId, id);
    return orderView(order);
  }

  async ship(userId: string, id: string) {
    return this.transition(userId, id, {
      by: ['seller'],
      from: OrderStatus.to_ship,
      to: OrderStatus.shipping,
      stock: { reason: InventoryReason.sale, onHand: -1, reserved: -1 },
    });
  }

  async cancel(userId: string, id: string) {
    return this.transition(userId, id, {
      by: ['buyer', 'seller'],
      from: OrderStatus.to_ship,
      to: OrderStatus.cancelled,
      stock: { reason: InventoryReason.release, onHand: 0, reserved: -1 },
    });
  }

  async receive(userId: string, id: string) {
    return this.transition(userId, id, {
      by: ['buyer'],
      from: OrderStatus.shipping,
      to: OrderStatus.completed,
    });
  }

  private async list(where: Prisma.OrderWhereInput, query: ListOrdersQuery) {
    const orders = await this.prisma.order.findMany({
      where: { ...where, status: query.status },
      include: orderInclude,
      ...cursorArgs(query),
    });
    const page = toPage(orders, query.limit);
    return { ...page, items: page.items.map(orderView) };
  }

  private async involved(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { ...orderInclude, shop: true },
    });
    const party: Party | null =
      order?.buyerId === userId
        ? 'buyer'
        : order?.shop.ownerId === userId
          ? 'seller'
          : null;
    if (!order || !party) throw new NotFoundException('Order not found');
    return {
      party,
      order: { ...order, shop: { id: order.shop.id, name: order.shop.name } },
    };
  }

  private async transition(
    userId: string,
    id: string,
    rule: {
      by: Party[];
      from: OrderStatus;
      to: OrderStatus;
      stock?: { reason: InventoryReason; onHand: number; reserved: number };
    },
  ) {
    const { party, order } = await this.involved(userId, id);
    if (!rule.by.includes(party)) {
      throw new ForbiddenException(
        `Only the ${rule.by.join(' or ')} can do this`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: rule.from },
        data: { status: rule.to },
      });
      if (count === 0) {
        throw new ConflictException(`Order is not ${rule.from}`);
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: rule.from,
          toStatus: rule.to,
          actorId: userId,
        },
      });
      if (!rule.stock) return;

      const { reason, onHand, reserved } = rule.stock;
      for (const item of [...order.items].sort((a, b) =>
        a.modelId.localeCompare(b.modelId),
      )) {
        await tx.$executeRaw`
          UPDATE inventory
          SET on_hand = on_hand + ${onHand * item.quantity},
              reserved = reserved + ${reserved * item.quantity},
              updated_at = now()
          WHERE model_id = ${item.modelId}::uuid`;
      }
      await tx.inventoryMovement.createMany({
        data: order.items.map((item) => ({
          modelId: item.modelId,
          delta: -item.quantity,
          reason,
          refType: 'order',
          refId: id,
          actorId: userId,
        })),
      });
    });
    return this.get(userId, id);
  }
}
