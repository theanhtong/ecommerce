import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemStatus, Prisma, PromotionType, ShopStatus } from '@marketplace/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { variationName } from '../catalog/items.service.js';
import { mediaUrl } from '../storage/storage.service.js';
import type { CreateFlashSaleDto } from './dto/flash-sale.dto.js';
import { flashAllowance } from './flash-sales.js';

// Assumption: a shop flash sale runs for at most a day.
const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
// Lets a sale created "now" start a moment in the past.
const CLOCK_SKEW_MS = 60 * 1000;
const PUBLIC_LIMIT = 24;

const modelInclude = {
  model: {
    include: {
      item: {
        include: {
          images: { orderBy: { position: 'asc' }, take: 1 },
          tierVariations: {
            orderBy: { position: 'asc' },
            include: { options: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  },
} satisfies Prisma.FlashSaleModelInclude;

type SaleModel = Prisma.FlashSaleModelGetPayload<{
  include: typeof modelInclude;
}>;

const saleModelView = ({ model, ...m }: SaleModel) => ({
  id: m.id,
  modelId: model.id,
  itemId: model.item.id,
  itemName: model.item.name,
  variation: variationName(model.tierIndex, model.item.tierVariations),
  image: model.item.images[0] ? mediaUrl(model.item.images[0].key) : null,
  originalPrice: model.price,
  price: m.price,
  quota: m.quota,
  sold: m.sold,
  purchaseLimit: m.purchaseLimit,
});

@Injectable()
export class FlashSalesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateFlashSaleDto, now = new Date()) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    if (shop.status !== ShopStatus.active) {
      throw new ForbiddenException('Shop is not active');
    }
    if (dto.startsAt.getTime() < now.getTime() - CLOCK_SKEW_MS) {
      throw new BadRequestException('startsAt must not be in the past');
    }
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (dto.endsAt.getTime() - dto.startsAt.getTime() > MAX_DURATION_MS) {
      throw new BadRequestException('A flash sale lasts at most 24 hours');
    }
    const ids = dto.models.map((m) => m.modelId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Each model can appear once');
    }

    const promotion = await this.prisma.$transaction(async (tx) => {
      // Locks the models so two overlapping sales for one model cannot both pass the check.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT m.id FROM models m JOIN items i ON i.id = m.item_id
        WHERE m.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
          AND m.deleted_at IS NULL AND i.shop_id = ${shop.id}::uuid
        ORDER BY m.id
        FOR UPDATE OF m`;
      if (locked.length !== ids.length) {
        throw new NotFoundException('Model not found');
      }
      const models = new Map(
        (
          await tx.model.findMany({
            where: { id: { in: ids } },
            include: { inventory: true },
          })
        ).map((m) => [m.id, m]),
      );
      for (const line of dto.models) {
        const model = models.get(line.modelId)!;
        const stock = model.inventory
          ? model.inventory.onHand - model.inventory.reserved
          : 0;
        if (line.price >= model.price) {
          throw new BadRequestException(
            'The flash sale price must be below the regular price',
          );
        }
        // Assumption: the quota must be in stock when the sale is created.
        if (line.quota > stock) {
          throw new BadRequestException('The quota is more than the stock');
        }
        if (line.purchaseLimit > line.quota) {
          throw new BadRequestException(
            'The purchase limit cannot exceed the quota',
          );
        }
      }
      const overlapping = await tx.flashSaleModel.count({
        where: {
          modelId: { in: ids },
          promotion: {
            startsAt: { lt: dto.endsAt },
            endsAt: { gt: dto.startsAt },
          },
        },
      });
      if (overlapping) {
        throw new ConflictException(
          'A model is already in a flash sale at that time',
        );
      }
      return tx.promotion.create({
        data: {
          type: PromotionType.flash_sale,
          shopId: shop.id,
          name: dto.name,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          flashSale: { create: dto.models },
        },
      });
    });
    return this.get(promotion.id);
  }

  async listForShop(ownerId: string) {
    const promotions = await this.prisma.promotion.findMany({
      where: { type: PromotionType.flash_sale, shop: { ownerId } },
      orderBy: { startsAt: 'desc' },
      include: { flashSale: { include: modelInclude } },
    });
    return promotions.map((p) => this.view(p));
  }

  async end(ownerId: string, id: string) {
    const now = new Date();
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, type: PromotionType.flash_sale, shop: { ownerId } },
    });
    if (!promotion) throw new NotFoundException('Flash sale not found');
    if (promotion.endsAt <= now) {
      throw new ConflictException('Flash sale has already ended');
    }
    await this.prisma.promotion.update({
      where: { id },
      data: {
        endsAt: now,
        ...(promotion.startsAt >= now && {
          startsAt: new Date(now.getTime() - 1),
        }),
      },
    });
    return this.get(id);
  }

  // Running sales across all shops, ending soonest first.
  async listActive(now = new Date()) {
    const rows = await this.prisma.flashSaleModel.findMany({
      where: {
        promotion: {
          startsAt: { lte: now },
          endsAt: { gt: now },
          shop: { status: ShopStatus.active },
        },
        model: { deletedAt: null, item: { status: ItemStatus.active } },
      },
      include: {
        ...modelInclude,
        promotion: { select: { endsAt: true } },
      },
      orderBy: [{ promotion: { endsAt: 'asc' } }, { id: 'asc' }],
      take: PUBLIC_LIMIT * 2,
    });
    return rows
      .filter((r) => r.sold < r.quota)
      .slice(0, PUBLIC_LIMIT)
      .map(({ promotion, ...r }) => ({
        ...saleModelView(r),
        endsAt: promotion.endsAt,
      }));
  }

  // One flash sale line for its own page, including ended or sold-out ones.
  async getPublic(id: string, now = new Date()) {
    const row = await this.prisma.flashSaleModel.findFirst({
      where: {
        id,
        promotion: { shop: { status: ShopStatus.active } },
        model: { deletedAt: null, item: { status: ItemStatus.active } },
      },
      include: {
        ...modelInclude,
        promotion: {
          select: {
            startsAt: true,
            endsAt: true,
            shop: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Flash sale not found');
    const { promotion, ...rest } = row;
    return {
      ...saleModelView(rest),
      shop: promotion.shop,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      status:
        promotion.endsAt <= now
          ? 'ended'
          : promotion.startsAt > now
            ? 'upcoming'
            : rest.sold >= rest.quota
              ? 'sold_out'
              : 'running',
    };
  }

  async allowance(buyerId: string, id: string) {
    const row = await this.prisma.flashSaleModel.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Flash sale not found');
    return { allowance: await flashAllowance(this.prisma, buyerId, row) };
  }

  private async get(id: string) {
    return this.view(
      await this.prisma.promotion.findUniqueOrThrow({
        where: { id },
        include: { flashSale: { include: modelInclude } },
      }),
    );
  }

  private view({
    flashSale,
    ...p
  }: Prisma.PromotionGetPayload<{
    include: { flashSale: { include: typeof modelInclude } };
  }>) {
    return {
      id: p.id,
      name: p.name,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      models: flashSale.map(saleModelView),
    };
  }
}
