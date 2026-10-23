import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ShopStatus } from '@ecommerce/db';
import { withinChangeCooldown } from '../../common/cooldown.js';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateShopDto } from './dto/create-shop.dto.js';
import type { ListShopsQuery } from './dto/list-shops.query.js';
import type { UpdateShopDto } from './dto/update-shop.dto.js';

// Rejected shops go back to pending when the owner edits them, not through admin.
const ADMIN_TRANSITIONS: Record<ShopStatus, ShopStatus[]> = {
  pending: [ShopStatus.active, ShopStatus.rejected],
  active: [ShopStatus.banned],
  rejected: [],
  banned: [ShopStatus.active],
};

const publicSelect = {
  id: true,
  name: true,
  description: true,
  createdAt: true,
} satisfies Prisma.ShopSelect;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateShopDto) {
    await this.assertNoShop(ownerId);
    await this.assertNameAvailable(dto.name);
    try {
      return await this.prisma.shop.create({
        data: {
          ownerId,
          name: dto.name,
          description: dto.description,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.assertNoShop(ownerId);
      throw new ConflictException('Shop name already taken');
    }
  }

  async getMine(ownerId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return shop;
  }

  async updateMine(ownerId: string, dto: UpdateShopDto) {
    const shop = await this.getMine(ownerId);
    if (shop.status === ShopStatus.banned) {
      throw new ForbiddenException('Shop is banned');
    }

    const now = new Date();
    const nameChanged = dto.name !== undefined && dto.name !== shop.name;
    if (nameChanged && withinChangeCooldown(shop.nameChangedAt, now)) {
      throw new ConflictException(
        'Shop name can only be changed once every 30 days',
      );
    }

    if (nameChanged) await this.assertNameAvailable(dto.name!, shop.id);

    const data: Prisma.ShopUpdateManyMutationInput = {
      description: dto.description,
      ...(nameChanged && { name: dto.name, nameChangedAt: now }),
      ...(shop.status === ShopStatus.rejected && {
        status: ShopStatus.pending,
      }),
    };
    try {
      const { count } = await this.prisma.shop.updateMany({
        where: { id: shop.id, updatedAt: shop.updatedAt },
        data,
      });
      if (count === 0) throw new ConflictException('Shop changed, retry');
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Shop name already taken');
      }
      throw error;
    }
    return this.getMine(ownerId);
  }

  async getPublic(id: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id, status: ShopStatus.active },
      select: publicSelect,
    });
    if (!shop) throw new NotFoundException('Shop not found');
    return shop;
  }

  async list(query: ListShopsQuery) {
    const shops = await this.prisma.shop.findMany({
      where: { status: query.status },
      include: { owner: { select: { id: true, email: true, username: true } } },
      ...cursorArgs(query),
    });
    return toPage(shops, query.limit);
  }

  async updateStatus(id: string, status: ShopStatus) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');
    if (!ADMIN_TRANSITIONS[shop.status].includes(status)) {
      throw new ConflictException(
        `Cannot change shop from ${shop.status} to ${status}`,
      );
    }
    const { count } = await this.prisma.shop.updateMany({
      where: { id, status: shop.status },
      data: { status },
    });
    if (count === 0) throw new ConflictException('Shop status changed, retry');
    return this.prisma.shop.findUniqueOrThrow({ where: { id } });
  }

  private async assertNameAvailable(name: string, excludeId?: string) {
    const taken = await this.prisma.shop.count({
      where: { name, id: excludeId ? { not: excludeId } : undefined },
    });
    if (taken) throw new ConflictException('Shop name already taken');
  }

  private async assertNoShop(ownerId: string) {
    if (
      await this.prisma.shop.findUnique({
        where: { ownerId },
        select: { id: true },
      })
    ) {
      throw new ConflictException('You already have a shop');
    }
  }
}
