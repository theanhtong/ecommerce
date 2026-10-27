import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, ReturnReason, ReturnStatus } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { OrdersService } from './orders.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Buyers may ask for a return within 15 days of delivery.
const RETURN_WINDOW_MS = 15 * DAY_MS;
// Assumption: a seller who does not answer within 3 days is taken to accept the return.
const SELLER_ANSWER_MS = 3 * DAY_MS;

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
  ) {}

  async request(
    buyerId: string,
    orderId: string,
    { reason, note }: { reason: ReturnReason; note?: string },
    now = new Date(),
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { shipment: true },
    });
    if (!order || order.buyerId !== buyerId) {
      throw new NotFoundException('Order not found');
    }
    const deliveredAt = order.shipment?.deliveredAt;
    if (
      (order.status !== OrderStatus.delivered &&
        order.status !== OrderStatus.completed) ||
      !deliveredAt
    ) {
      throw new ConflictException(`Order is ${order.status}`);
    }
    if (now.getTime() - deliveredAt.getTime() > RETURN_WINDOW_MS) {
      throw new ConflictException('The return window has closed');
    }
    const { count } = await this.prisma.returnRequest.createMany({
      data: { orderId, reason, note },
      skipDuplicates: true,
    });
    if (!count) throw new ConflictException('A return was already requested');
    return this.orders.get(buyerId, orderId);
  }

  async sellerAccept(userId: string, orderId: string) {
    const request = await this.forSeller(userId, orderId);
    await this.decide(
      request.id,
      ReturnStatus.requested,
      ReturnStatus.accepted,
      userId,
    );
    return this.orders.get(userId, orderId);
  }

  // The seller cannot refuse outright; an admin settles the dispute.
  async sellerReject(userId: string, orderId: string, note: string) {
    const request = await this.forSeller(userId, orderId);
    await this.decide(
      request.id,
      ReturnStatus.requested,
      ReturnStatus.disputed,
      userId,
      {
        sellerNote: note,
      },
    );
    return this.orders.get(userId, orderId);
  }

  adminAccept(id: string, adminId: string) {
    return this.decide(
      id,
      ReturnStatus.disputed,
      ReturnStatus.accepted,
      adminId,
    );
  }

  adminReject(id: string, adminId: string) {
    return this.decide(
      id,
      ReturnStatus.disputed,
      ReturnStatus.rejected,
      adminId,
    );
  }

  async list(query: CursorQuery & { status?: ReturnStatus }) {
    const rows = await this.prisma.returnRequest.findMany({
      where: { status: query.status },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            shop: { select: { id: true, name: true } },
            buyer: { select: { id: true, username: true } },
          },
        },
      },
      ...cursorArgs(query, 'desc'),
    });
    return toPage(rows, query.limit);
  }

  async acceptUnanswered(now = new Date()) {
    const stale = await this.prisma.returnRequest.findMany({
      where: {
        status: ReturnStatus.requested,
        createdAt: { lt: new Date(now.getTime() - SELLER_ANSWER_MS) },
      },
      select: { id: true },
    });
    let accepted = 0;
    for (const { id } of stale) {
      try {
        await this.decide(
          id,
          ReturnStatus.requested,
          ReturnStatus.accepted,
          null,
        );
        accepted++;
      } catch (error) {
        // The seller answered in the meantime.
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    return accepted;
  }

  private async decide(
    id: string,
    from: ReturnStatus,
    to: ReturnStatus,
    actorId: string | null,
    data: Prisma.ReturnRequestUpdateManyMutationInput = {},
  ) {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.returnRequest.updateMany({
        where: { id, status: from },
        data: { ...data, status: to, decidedAt: new Date() },
      });
      const request = await tx.returnRequest.findUnique({ where: { id } });
      if (!request) throw new NotFoundException('Return not found');
      if (!count) throw new ConflictException(`Return is ${request.status}`);
      if (to === ReturnStatus.accepted) {
        await this.orders.returnOrder(tx, request.orderId, actorId);
      }
      return request;
    });
  }

  private async forSeller(userId: string, orderId: string) {
    const request = await this.prisma.returnRequest.findUnique({
      where: { orderId },
      include: { order: { include: { shop: true } } },
    });
    if (!request) throw new NotFoundException('Return not found');
    if (request.order.shop.ownerId !== userId) {
      throw request.order.buyerId === userId
        ? new ForbiddenException('Only the seller can do this')
        : new NotFoundException('Return not found');
    }
    return request;
  }
}
