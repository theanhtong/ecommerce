import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { AddWishlistDto } from './dto/add-wishlist.dto.js';
import { CheckWishlistDto } from './dto/check-wishlist.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildPaginated } from '../common/helpers/pagination.helper.js';
import { uuidv7 } from 'uuidv7';

@Injectable()
export class WishlistsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, query: PaginationDto) {
    const where = { userId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.wishlist.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            include: {
              images: { orderBy: { order: 'asc' }, take: 1 },
              variants: {
                include: { inventory: true },
                take: 1,
              },
            },
          },
        },
      }),
      this.prisma.wishlist.count({ where }),
    ]);

    return buildPaginated(data, total, query.page, query.limit);
  }

  async add(userId: string, dto: AddWishlistDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    if (variant.productId !== product.id) {
      throw new BadRequestException('Variant does not belong to this product');
    }

    const existing = await this.prisma.wishlist.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: product.id,
        },
      },
    });
    if (existing) {
      throw new ConflictException('Product already in wishlist');
    }

    return this.prisma.wishlist.create({
      data: {
        id: uuidv7(),
        userId,
        productId: product.id,
        variantId: variant.id,
      },
      include: {
        product: true,
        variant: true,
      },
    });
  }

  async remove(userId: string, wishlistId: string) {
    const wishlist = await this.prisma.wishlist.findFirst({
      where: { id: wishlistId, userId },
    });
    if (!wishlist) {
      throw new NotFoundException('Product not in wishlist');
    }
    return this.prisma.wishlist.delete({ where: { id: wishlistId } });
  }

  async check(userId: string, dto: CheckWishlistDto) {
    const wishlist = await this.prisma.wishlist.findUnique({
      where: {
        userId_productId: {
          userId,
          productId: dto.productId,
        },
      },
    });

    return {
      isWishlisted: !!wishlist,
    };
  }
}
