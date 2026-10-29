import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LedgerAccountType, Prisma, ShopStatus } from '@marketplace/db';
import { withinChangeCooldown } from '../../common/cooldown.js';
import { latestReason, moderationHistory } from '../../common/moderation.js';
import { cursorArgs, toPage } from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ratingView } from '../reviews/review-view.js';
import {
  assertWardExists,
  locationInclude,
  locationView,
} from '../regions/location.js';
import type { CreateShopDto } from './dto/create-shop.dto.js';
import type { ListShopsQuery } from './dto/list-shops.query.js';
import type { ShopAddressDto } from './dto/shop-address.dto.js';
import type { UpdateShopDto } from './dto/update-shop.dto.js';
import { coded } from '../../common/http-error.js';

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
  ratingCount: true,
  ratingSum: true,
  freeship: true,
  createdAt: true,
} satisfies Prisma.ShopSelect;

const shopQuery = {
  omit: { wardCode: true },
  include: locationInclude,
} satisfies Pick<Prisma.ShopFindUniqueArgs, 'omit' | 'include'>;

const shopView = ({
  ward,
  ...shop
}: Prisma.ShopGetPayload<typeof shopQuery>) => ({
  ...shop,
  ...locationView({ ward }),
});

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateShopDto) {
    await this.assertNoShop(ownerId);
    await this.assertNameAvailable(dto.name);
    await assertWardExists(this.prisma, dto.wardCode);
    try {
      const shop = await this.prisma.shop.create({
        data: {
          ownerId,
          name: dto.name,
          description: dto.description,
          contactName: dto.contactName,
          phone: dto.phone,
          wardCode: dto.wardCode,
          street: dto.street,
          ledgerAccount: { create: { type: LedgerAccountType.wallet } },
        },
        ...shopQuery,
      });
      return shopView(shop);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.assertNoShop(ownerId);
      throw new ConflictException('Shop name already taken');
    }
  }

  async getMine(ownerId: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { ownerId },
      ...shopQuery,
    });
    if (!shop) throw new NotFoundException('You do not have a shop');
    const decided =
      shop.status === ShopStatus.banned || shop.status === ShopStatus.rejected;
    return {
      ...shopView(shop),
      statusReason: decided
        ? await latestReason(this.prisma, { shopId: shop.id }, shop.status)
        : null,
    };
  }

  // Asking to join waits for the admin; turning it off cancels the request or leaves the program.
  // Leaving applies to orders placed from now on; orders already placed keep their fee.
  async setFreeship(ownerId: string, enabled: boolean) {
    const shop = await this.getMine(ownerId);
    if (shop.status !== ShopStatus.active) {
      throw new ForbiddenException('Shop is not active');
    }
    await this.prisma.shop.update({
      where: { id: shop.id },
      data: enabled
        ? { freeshipRequestedAt: shop.freeship ? null : new Date() }
        : { freeship: false, freeshipRequestedAt: null },
    });
    return this.getMine(ownerId);
  }

  async decideFreeship(id: string, approve: boolean) {
    const { count } = await this.prisma.shop.updateMany({
      where: { id, freeshipRequestedAt: { not: null } },
      data: { freeship: approve, freeshipRequestedAt: null },
    });
    if (!count) throw new ConflictException('No Freeship request to decide');
    return this.getForAdmin(id);
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

  async setAddress(ownerId: string, dto: ShopAddressDto) {
    const shop = await this.getMine(ownerId);
    if (shop.status === ShopStatus.banned) {
      throw new ForbiddenException('Shop is banned');
    }
    await assertWardExists(this.prisma, dto.wardCode);
    const { contactName, phone, wardCode, street } = dto;
    await this.prisma.shop.update({
      where: { id: shop.id },
      data: { contactName, phone, wardCode, street },
    });
    return this.getMine(ownerId);
  }

  async getPublic(id: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id, status: ShopStatus.active },
      select: publicSelect,
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const { ratingCount, ratingSum, ...rest } = shop;
    return { ...rest, ...ratingView({ ratingCount, ratingSum }) };
  }

  async getForAdmin(id: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      omit: shopQuery.omit,
      include: {
        ...shopQuery.include,
        owner: { select: { id: true, email: true, username: true } },
        ledgerAccount: { select: { id: true } },
        _count: { select: { items: true, orders: true } },
        moderations: moderationHistory,
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const { owner, ledgerAccount, _count, ...rest } = shop;
    const wallet = ledgerAccount
      ? await this.prisma.ledgerLine.aggregate({
          where: { accountId: ledgerAccount.id },
          _sum: { amount: true },
        })
      : null;
    return {
      ...shopView(rest),
      owner,
      itemCount: _count.items,
      orderCount: _count.orders,
      // Wallet lines are credit-negative; the shop sees what it is owed.
      walletBalance: -(wallet?._sum.amount ?? 0),
    };
  }

  async list(query: ListShopsQuery) {
    const shops = await this.prisma.shop.findMany({
      where: {
        status: query.status,
        ...(query.freeship === 'requested' && {
          freeshipRequestedAt: { not: null },
        }),
      },
      include: {
        owner: { select: { id: true, email: true, username: true } },
        ward: { select: { province: { select: { fullName: true } } } },
        ledgerAccount: { select: { id: true } },
        _count: { select: { items: true, orders: true } },
      },
      ...cursorArgs(query),
    });
    const page = toPage(shops, query.limit);
    const sums = await this.prisma.ledgerLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: {
          in: page.items.flatMap((s) => s.ledgerAccount?.id ?? []),
        },
      },
      _sum: { amount: true },
    });
    const owed = new Map(sums.map((s) => [s.accountId, -(s._sum.amount ?? 0)]));
    return {
      ...page,
      items: page.items.map(({ ward, ledgerAccount, _count, ...shop }) => ({
        ...shop,
        province: ward.province.fullName,
        itemCount: _count.items,
        orderCount: _count.orders,
        walletBalance: (ledgerAccount && owed.get(ledgerAccount.id)) || 0,
      })),
    };
  }

  async updateStatus(
    actorId: string,
    id: string,
    status: ShopStatus,
    reason?: string,
  ) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');
    if (!ADMIN_TRANSITIONS[shop.status].includes(status)) {
      throw new ConflictException(
        coded(
          'shop_status_change',
          `Cannot change shop from ${shop.status} to ${status}`,
        ),
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shop.updateMany({
        where: { id, status: shop.status },
        data: { status },
      });
      if (count === 0) {
        throw new ConflictException('Shop status changed, retry');
      }
      await tx.moderationAction.create({
        data: {
          shopId: id,
          actorId,
          status,
          reason:
            status === ShopStatus.banned || status === ShopStatus.rejected
              ? reason
              : null,
        },
      });
    });
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
