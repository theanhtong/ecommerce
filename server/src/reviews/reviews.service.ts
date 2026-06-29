import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CreateReplyDto } from './dto/create-reply.dto.js';
import { CreateReviewDto } from './dto/create-review.dto.js';
import { OrderStatus } from '../generated/prisma/enums.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { buildPaginated } from '../common/helpers/pagination.helper.js';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const existing = await this.prisma.review.findFirst({
      where: { productId: dto.productId, userId },
    });
    if (existing)
      throw new BadRequestException('You have already reviewed this product');

    let isVerifiedPurchase = false;

    if (dto.orderItemId) {
      const orderItem = await this.prisma.orderItem.findUnique({
        where: { id: dto.orderItemId },
        include: { order: true },
      });

      if (!orderItem) throw new NotFoundException('Order item not found');
      if (orderItem.order.userId !== userId)
        throw new ForbiddenException('Access denied');
      if (orderItem.order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException(
          'Order must be DELIVERED to leave a review',
        );
      }

      isVerifiedPurchase = true;
    }

    return this.prisma.review.create({
      data: {
        id: uuidv7(),
        userId,
        productId: dto.productId,
        variantId: dto.variantId,
        orderItemId: dto.orderItemId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        isVerifiedPurchase,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, avatarUrl: true } },
          },
        },
      },
    });
  }

  async findByProduct(productId: string, query: PaginationDto) {
    const where = { productId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, avatarUrl: true } },
          replies: {
            include: {
              user: { select: { id: true, name: true, avatarUrl: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    const avgRating = await this.prisma.review.aggregate({
      where,
      _avg: { rating: true },
    });

    return {
      ...buildPaginated(data, total, query.page, query.limit),
      avgRating: avgRating._avg.rating ?? 0,
    };
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.review.update({
      where: { id: reviewId },
      data: dto,
    });
  }

  async remove(userId: string, reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.review.delete({ where: { id: reviewId } });
  }

  async createReply(userId: string, reviewId: string, dto: CreateReplyDto) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');

    return this.prisma.reviewReply.create({
      data: {
        id: uuidv7(),
        reviewId,
        userId,
        body: dto.body,
      },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  }

  async findAll(query: PaginationDto) {
    const where = {
      ...(query.search && {
        OR: [
          { title: { contains: query.search, mode: 'insensitive' as const } },
          { body: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          product: { select: { id: true, name: true, slug: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return buildPaginated(data, total, query.page, query.limit);
  }

  async adminRemove(reviewId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Review not found');

    return this.prisma.review.delete({ where: { id: reviewId } });
  }
}
