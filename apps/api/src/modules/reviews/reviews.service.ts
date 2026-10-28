import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { emit } from '../notifications/outbox.service.js';
import { reviewView } from './review-view.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Buyers review within 30 days of completion and may edit once within 30 days of the first review.
const REVIEW_WINDOW_MS = 30 * DAY_MS;
const EDIT_WINDOW_MS = 30 * DAY_MS;

type ReviewInput = { rating: number; comment?: string };

const listInclude = {
  buyer: { select: { username: true } },
  orderItem: { select: { modelName: true } },
} satisfies Prisma.ReviewInclude;

const listView = ({
  buyer,
  orderItem,
  ...r
}: Prisma.ReviewGetPayload<{ include: typeof listInclude }>) => ({
  ...reviewView(r),
  buyer: buyer.username,
  modelName: orderItem.modelName,
});

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    buyerId: string,
    orderItemId: string,
    { rating, comment }: ReviewInput,
    now = new Date(),
  ) {
    const line = await this.prisma.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        model: { select: { itemId: true } },
        order: {
          include: {
            history: { where: { toStatus: OrderStatus.completed }, take: 1 },
          },
        },
      },
    });
    if (!line || line.order.buyerId !== buyerId) {
      throw new NotFoundException('Order item not found');
    }
    const completedAt = line.order.history[0]?.createdAt;
    if (line.order.status !== OrderStatus.completed || !completedAt) {
      throw new ConflictException(`Order is ${line.order.status}`);
    }
    if (now.getTime() - completedAt.getTime() > REVIEW_WINDOW_MS) {
      throw new ConflictException('The review window has closed');
    }

    const review = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.review.createMany({
        data: {
          orderItemId,
          itemId: line.model.itemId,
          shopId: line.order.shopId,
          buyerId,
          rating,
          comment,
        },
        skipDuplicates: true,
      });
      if (!count) throw new ConflictException('Already reviewed');
      const review = await tx.review.findUniqueOrThrow({
        where: { orderItemId },
      });
      await this.addToTotals(tx, review, 1, rating);
      await emit(tx, {
        type: 'review.created',
        payload: {
          orderId: line.orderId,
          reviewId: review.id,
          actorId: buyerId,
        },
      });
      return review;
    });
    return reviewView(review);
  }

  // The buyer's lines of this item: reviewed ones, and ones that can still be reviewed.
  async mineForItem(buyerId: string, itemId: string, now = new Date()) {
    const lines = await this.prisma.orderItem.findMany({
      where: {
        model: { itemId },
        order: { buyerId },
        OR: [
          { review: { isNot: null } },
          {
            order: {
              status: OrderStatus.completed,
              history: {
                some: {
                  toStatus: OrderStatus.completed,
                  createdAt: {
                    gte: new Date(now.getTime() - REVIEW_WINDOW_MS),
                  },
                },
              },
            },
          },
        ],
      },
      include: { review: true },
      orderBy: { id: 'desc' },
    });
    return lines.map((l) => ({
      id: l.id,
      orderId: l.orderId,
      itemName: l.itemName,
      modelName: l.modelName,
      review: l.review && reviewView(l.review),
    }));
  }

  async edit(
    buyerId: string,
    id: string,
    { rating, comment }: ReviewInput,
    now = new Date(),
  ) {
    const review = await this.prisma.$transaction(async (tx) => {
      const [old] = await tx.$queryRaw<
        {
          buyer_id: string;
          rating: number;
          edited_at: Date | null;
          created_at: Date;
        }[]
      >`SELECT buyer_id, rating, edited_at, created_at FROM reviews
        WHERE id = ${id}::uuid FOR UPDATE`;
      if (!old || old.buyer_id !== buyerId) {
        throw new NotFoundException('Review not found');
      }
      if (old.edited_at) throw new ConflictException('Already edited');
      if (now.getTime() - old.created_at.getTime() > EDIT_WINDOW_MS) {
        throw new ConflictException('The edit window has closed');
      }
      const review = await tx.review.update({
        where: { id },
        data: { rating, comment: comment ?? null, editedAt: now },
      });
      await this.addToTotals(tx, review, 0, rating - old.rating);
      return review;
    });
    return reviewView(review);
  }

  // Assumption: the seller replies once and cannot change the reply.
  async reply(ownerId: string, id: string, reply: string) {
    const { count } = await this.prisma.review.updateMany({
      where: { id, shop: { ownerId }, sellerReply: null },
      data: { sellerReply: reply, repliedAt: new Date() },
    });
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { shop: { select: { ownerId: true } } },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.shop.ownerId !== ownerId) {
      throw review.buyerId === ownerId
        ? new ForbiddenException('Only the seller can do this')
        : new NotFoundException('Review not found');
    }
    if (!count) throw new ConflictException('Already replied');
    return reviewView(review);
  }

  async listForItem(itemId: string, query: CursorQuery & { rating?: number }) {
    const rows = await this.prisma.review.findMany({
      where: { itemId, rating: query.rating },
      include: listInclude,
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(rows, query.limit);
    return { ...page, items: page.items.map(listView) };
  }

  async listForShop(
    ownerId: string,
    query: CursorQuery & { replied?: boolean },
  ) {
    const rows = await this.prisma.review.findMany({
      where: {
        shop: { ownerId },
        sellerReply:
          query.replied === undefined
            ? undefined
            : query.replied
              ? { not: null }
              : null,
      },
      include: {
        ...listInclude,
        item: { select: { id: true, name: true } },
      },
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(rows, query.limit);
    return {
      ...page,
      items: page.items.map(({ item, ...r }) => ({ ...listView(r), item })),
    };
  }

  private async addToTotals(
    tx: Prisma.TransactionClient,
    { itemId, shopId }: { itemId: string; shopId: string },
    count: number,
    sum: number,
  ) {
    const data = {
      ratingCount: { increment: count },
      ratingSum: { increment: sum },
    };
    await tx.item.update({ where: { id: itemId }, data });
    await tx.shop.update({ where: { id: shopId }, data });
  }
}
