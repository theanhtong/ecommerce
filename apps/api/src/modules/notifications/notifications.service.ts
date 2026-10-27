import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, OrderStatus, ReturnStatus } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { PublishedEvent } from './outbox.service.js';

type Audience = 'buyer' | 'seller';

const ORDER_NOTICES: Partial<
  Record<OrderStatus, [NotificationType, Audience[]]>
> = {
  to_ship: [NotificationType.new_order, ['seller']],
  shipping: [NotificationType.order_shipping, ['buyer']],
  delivered: [NotificationType.order_delivered, ['buyer']],
  completed: [NotificationType.order_completed, ['seller']],
  cancelled: [NotificationType.order_cancelled, ['buyer', 'seller']],
  returned: [NotificationType.order_returned, ['buyer', 'seller']],
};

const RETURN_NOTICES: Partial<
  Record<ReturnStatus, [NotificationType, Audience[]]>
> = {
  requested: [NotificationType.return_requested, ['seller']],
  rejected: [NotificationType.return_rejected, ['buyer']],
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async handle(event: PublishedEvent) {
    const notice: [NotificationType, Audience[]] | undefined =
      event.type === 'order.status_changed'
        ? ORDER_NOTICES[event.payload.to]
        : event.type === 'return.status_changed'
          ? RETURN_NOTICES[event.payload.status]
          : [NotificationType.new_review, ['seller']];
    if (!notice) return 0;
    const [type, audience] = notice;
    const order = await this.prisma.order.findUnique({
      where: { id: event.payload.orderId },
      select: { buyerId: true, shop: { select: { ownerId: true } } },
    });
    if (!order) return 0;
    const users = { buyer: order.buyerId, seller: order.shop.ownerId };
    const { count } = await this.prisma.notification.createMany({
      data: audience
        .map((a) => users[a])
        .filter((userId) => userId !== event.payload.actorId)
        .map((userId) => ({
          eventId: event.id,
          userId,
          orderId: event.payload.orderId,
          type,
        })),
      skipDuplicates: true,
    });
    return count;
  }

  async list(userId: string, query: CursorQuery) {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        include: { order: { select: { buyerId: true } } },
        ...cursorArgs(query, 'desc'),
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const page = toPage(rows, query.limit);
    return {
      ...page,
      items: page.items.map(({ order, ...n }) => ({
        id: n.id,
        type: n.type,
        orderId: n.orderId,
        audience: (order.buyerId === userId ? 'buyer' : 'seller') as Audience,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
      unread,
    };
  }

  async markRead(userId: string, id?: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, id, readAt: null },
      data: { readAt: new Date() },
    });
    if (id && !count) {
      const exists = await this.prisma.notification.count({
        where: { userId, id },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
  }
}
