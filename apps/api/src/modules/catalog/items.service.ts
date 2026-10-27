import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryReason, ItemStatus, Prisma, ShopStatus } from '@ecommerce/db';
import {
  cursorArgs,
  toPage,
  type CursorQuery,
} from '../../common/pagination.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ratingView } from '../reviews/review-view.js';
import type {
  AdminListItemsQuery,
  CreateItemDto,
  ItemSort,
  SearchItemsQuery,
  UpdateItemDto,
} from './dto/item.dto.js';
import type { StockAdjustmentDto } from './dto/stock-adjustment.dto.js';
import type { ModelFieldsDto, VariationsDto } from './dto/variations.dto.js';
import { validateVariations } from './variations.js';

const modelInclude = { inventory: true } satisfies Prisma.ModelInclude;

const detailInclude = {
  shop: { select: { id: true, name: true } },
  tierVariations: {
    orderBy: { position: 'asc' },
    include: { options: { orderBy: { position: 'asc' } } },
  },
  models: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    include: modelInclude,
  },
} satisfies Prisma.ItemInclude;

const summaryInclude = {
  shop: { select: { id: true, name: true } },
  models: { where: { deletedAt: null }, include: modelInclude },
} satisfies Prisma.ItemInclude;

type ModelWithInventory = Prisma.ModelGetPayload<{
  include: typeof modelInclude;
}>;
type ItemDetail = Prisma.ItemGetPayload<{ include: typeof detailInclude }>;
type ItemSummary = Prisma.ItemGetPayload<{ include: typeof summaryInclude }>;

// "Đỏ, M" for a two-tier model, null for an item without variations.
export const variationName = (
  tierIndex: number[],
  tierVariations: { options: { option: string }[] }[],
) =>
  tierIndex
    .map((option, t) => tierVariations[t]?.options[option]?.option)
    .join(', ') || null;

export const available = (m: ModelWithInventory) =>
  m.inventory ? m.inventory.onHand - m.inventory.reserved : 0;

const modelView = (m: ModelWithInventory, seller: boolean) => ({
  id: m.id,
  tierIndex: m.tierIndex,
  price: m.price,
  sku: m.sku,
  stock: available(m),
  ...(seller && {
    onHand: m.inventory?.onHand ?? 0,
    reserved: m.inventory?.reserved ?? 0,
  }),
});

const detailView = (
  { tierVariations, models, ratingCount, ratingSum, ...item }: ItemDetail,
  seller: boolean,
) => ({
  ...item,
  ...ratingView({ ratingCount, ratingSum }),
  tierVariations: tierVariations.map((t) => ({
    name: t.name,
    options: t.options.map((o) => o.option),
  })),
  models: models.map((m) => modelView(m, seller)),
});

const summaryView = ({ models, ...item }: ItemSummary) => {
  const prices = models.map((m) => m.price);
  return {
    id: item.id,
    name: item.name,
    status: item.status,
    shop: item.shop,
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    stock: models.reduce((sum, m) => sum + available(m), 0),
    ...ratingView(item),
    createdAt: item.createdAt,
  };
};

const variationsCreate = (dto: VariationsDto, actorId: string) => ({
  tierVariations: {
    create: dto.tierVariations.map((tier, position) => ({
      position,
      name: tier.name,
      options: {
        create: tier.options.map((option, i) => ({ position: i, option })),
      },
    })),
  },
  models: {
    create: dto.models.map(({ tierIndex, price, stock, sku }) => ({
      tierIndex,
      price,
      sku,
      inventory: { create: { onHand: stock } },
      movements: {
        create:
          stock > 0
            ? [{ delta: stock, reason: InventoryReason.restock, actorId }]
            : [],
      },
    })),
  },
});

export const publicWhere = {
  status: ItemStatus.active,
  shop: { status: ShopStatus.active },
} satisfies Prisma.ItemWhereInput;

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002';

const isForeignKeyViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2003';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async activeShopOf(ownerId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new ForbiddenException('Open a shop first');
    if (shop.status !== ShopStatus.active) {
      throw new ForbiddenException('Shop is not active');
    }
    return shop;
  }

  async create(ownerId: string, dto: CreateItemDto) {
    const shop = await this.activeShopOf(ownerId);
    validateVariations(dto.tierVariations, dto.models);
    try {
      const item = await this.prisma.item.create({
        data: {
          shopId: shop.id,
          parentSku: dto.parentSku,
          name: dto.name,
          description: dto.description,
          weight: dto.weight,
          ...variationsCreate(dto, ownerId),
        },
        include: detailInclude,
      });
      return detailView(item, true);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Product code already exists in your shop');
      }
      throw error;
    }
  }

  async update(ownerId: string, id: string, dto: UpdateItemDto) {
    await this.writableItem(ownerId, id);
    const item = await this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        weight: dto.weight,
      },
      include: detailInclude,
    });
    return detailView(item, true);
  }

  // Ordered items stay because order_items reference their models.
  async remove(ownerId: string, id: string) {
    await this.writableItem(ownerId, id);
    const ordered = () =>
      new ConflictException('Item has orders and cannot be deleted');
    if (
      await this.prisma.orderItem.count({ where: { model: { itemId: id } } })
    ) {
      throw ordered();
    }
    try {
      await this.prisma.item.delete({ where: { id } });
    } catch (error) {
      if (isForeignKeyViolation(error)) throw ordered();
      throw error;
    }
  }

  async setStatus(ownerId: string, id: string, status: ItemStatus) {
    await this.writableItem(ownerId, id);
    const item = await this.prisma.item.update({
      where: { id },
      data: { status },
      include: detailInclude,
    });
    return detailView(item, true);
  }

  async replaceVariations(ownerId: string, id: string, dto: VariationsDto) {
    await this.writableItem(ownerId, id);
    validateVariations(dto.tierVariations, dto.models);
    const item = await this.prisma.$transaction(async (tx) => {
      // Old models stay for the orders that reference them; carts drop them.
      await tx.cartItem.deleteMany({
        where: { model: { itemId: id, deletedAt: null } },
      });
      await tx.model.updateMany({
        where: { itemId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await tx.tierVariation.deleteMany({ where: { itemId: id } });
      return tx.item.update({
        where: { id },
        data: variationsCreate(dto, ownerId),
        include: detailInclude,
      });
    });
    return detailView(item, true);
  }

  async updateModel(ownerId: string, modelId: string, dto: ModelFieldsDto) {
    await this.writableModel(ownerId, modelId);
    const updated = await this.prisma.model.update({
      where: { id: modelId },
      data: { price: dto.price, sku: dto.sku },
      include: modelInclude,
    });
    return modelView(updated, true);
  }

  async adjustStock(
    ownerId: string,
    modelId: string,
    dto: StockAdjustmentDto,
    idempotencyKey?: string,
  ) {
    await this.writableModel(ownerId, modelId);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.inventoryMovement.create({
          data: {
            modelId,
            delta: dto.delta,
            reason: dto.reason,
            actorId: ownerId,
            idempotencyKey,
          },
        });
        // Relative update so concurrent reservations are never overwritten.
        const changed = await tx.$executeRaw`
          UPDATE inventory
          SET on_hand = on_hand + ${dto.delta}, updated_at = now()
          WHERE model_id = ${modelId}::uuid AND on_hand + ${dto.delta} >= reserved`;
        if (changed === 0) {
          throw new ConflictException('Not enough unreserved stock');
        }
      });
    } catch (error) {
      if (!idempotencyKey || !isUniqueViolation(error)) throw error;
      // Replayed adjustment: return the current state.
      const previous = await this.prisma.inventoryMovement.findUnique({
        where: { idempotencyKey },
      });
      if (previous?.modelId !== modelId) {
        throw new ConflictException(
          'Idempotency key was used for another model',
        );
      }
    }
    const model = await this.prisma.model.findUniqueOrThrow({
      where: { id: modelId },
      include: modelInclude,
    });
    return modelView(model, true);
  }

  async listMovements(ownerId: string, modelId: string, query: CursorQuery) {
    const owned = await this.prisma.model.count({
      where: { id: modelId, item: { shop: { ownerId } } },
    });
    if (!owned) throw new NotFoundException('Model not found');
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { modelId },
      omit: { idempotencyKey: true },
      ...cursorArgs(query),
    });
    return toPage(movements, query.limit);
  }

  async listMine(ownerId: string, query: CursorQuery) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    const items = await this.prisma.item.findMany({
      where: { shopId: shop.id },
      include: summaryInclude,
      ...cursorArgs(query),
    });
    const page = toPage(items, query.limit);
    return { ...page, items: page.items.map(summaryView) };
  }

  async getMine(ownerId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, shop: { ownerId } },
      include: detailInclude,
    });
    if (!item) throw new NotFoundException('Item not found');
    return detailView(item, true);
  }

  async getPublic(id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, ...publicWhere },
      include: detailInclude,
    });
    if (!item) throw new NotFoundException('Item not found');
    return detailView(item, false);
  }

  async listForAdmin({ shopId, status, ...query }: AdminListItemsQuery) {
    const items = await this.prisma.item.findMany({
      where: { shopId, status },
      include: summaryInclude,
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(items, query.limit);
    return { ...page, items: page.items.map(summaryView) };
  }

  async listPublic(query: CursorQuery) {
    const items = await this.prisma.item.findMany({
      where: publicWhere,
      include: summaryInclude,
      ...cursorArgs(query, 'desc'),
    });
    const page = toPage(items, query.limit);
    return { ...page, items: page.items.map(summaryView) };
  }

  async search({
    q,
    minPrice,
    maxPrice,
    minRating,
    sort,
    page,
    limit,
  }: SearchItemsQuery) {
    const term = q || undefined;
    const order: ItemSort =
      sort === 'relevance' && !term
        ? 'newest'
        : (sort ?? (term ? 'relevance' : 'newest'));
    const where = [
      Prisma.sql`i.status = 'active'`,
      Prisma.sql`s.status = 'active'`,
      Prisma.sql`p.min_price IS NOT NULL`,
    ];
    if (term) {
      const like = term.replace(/[\\%_]/g, '\\$&');
      where.push(Prisma.sql`(search_text(i.name) LIKE '%' || search_text(${like}) || '%'
        OR search_text(${term}) <% search_text(i.name))`);
    }
    if (minPrice !== undefined) {
      where.push(Prisma.sql`p.min_price >= ${minPrice}`);
    }
    if (maxPrice !== undefined) {
      where.push(Prisma.sql`p.min_price <= ${maxPrice}`);
    }
    if (minRating !== undefined) {
      where.push(
        Prisma.sql`i.rating_count > 0 AND i.rating_sum >= ${minRating} * i.rating_count`,
      );
    }
    const orderBy = {
      relevance: Prisma.sql`word_similarity(search_text(${term ?? ''}), search_text(i.name)) DESC`,
      newest: Prisma.sql`i.id DESC`,
      sales: Prisma.sql`x.sold DESC`,
      price_asc: Prisma.sql`p.min_price ASC`,
      price_desc: Prisma.sql`p.min_price DESC`,
      rating: Prisma.sql`i.rating_sum::float / NULLIF(i.rating_count, 0) DESC NULLS LAST, i.rating_count DESC`,
    }[order];

    const rows = await this.prisma.$queryRaw<
      { id: string; sold: number; total: bigint }[]
    >`
      SELECT i.id, x.sold, count(*) OVER () AS total
      FROM items i
      JOIN shops s ON s.id = i.shop_id
      CROSS JOIN LATERAL (
        SELECT min(m.price) AS min_price FROM models m
        WHERE m.item_id = i.id AND m.deleted_at IS NULL) p
      -- Assumption: an item counts as sold once its order completes.
      -- shortcut: summed on every search, keep a counter on items once order volume grows.
      CROSS JOIN LATERAL (
        SELECT coalesce(sum(oi.quantity), 0)::int AS sold
        FROM order_items oi
        JOIN models m ON m.id = oi.model_id
        JOIN orders o ON o.id = oi.order_id
        WHERE m.item_id = i.id AND o.status = 'completed') x
      WHERE ${Prisma.join(where, ' AND ')}
      ORDER BY ${orderBy}, i.id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    const items = await this.prisma.item.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: summaryInclude,
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const total = Number(rows[0]?.total ?? 0);
    return {
      items: rows.map((r) => ({
        ...summaryView(byId.get(r.id)!),
        sold: r.sold,
      })),
      page,
      total,
      hasMore: page * limit < total,
    };
  }

  async listByShop(shopId: string, query: CursorQuery) {
    const items = await this.prisma.item.findMany({
      where: { shopId, ...publicWhere },
      include: summaryInclude,
      ...cursorArgs(query),
    });
    const page = toPage(items, query.limit);
    return { ...page, items: page.items.map(summaryView) };
  }

  async adminSetStatus(id: string, status: ItemStatus) {
    const exists = await this.prisma.item.count({ where: { id } });
    if (!exists) throw new NotFoundException('Item not found');
    const item = await this.prisma.item.update({
      where: { id },
      data: { status },
      include: detailInclude,
    });
    return detailView(item, true);
  }

  private async writableItem(ownerId: string, id: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, shop: { ownerId } },
      include: { shop: true },
    });
    if (!item) throw new NotFoundException('Item not found');
    this.assertWritable(item);
  }

  private async writableModel(ownerId: string, modelId: string) {
    const model = await this.prisma.model.findFirst({
      where: { id: modelId, deletedAt: null, item: { shop: { ownerId } } },
      include: { item: { include: { shop: true } } },
    });
    if (!model) throw new NotFoundException('Model not found');
    this.assertWritable(model.item);
  }

  private assertWritable(item: {
    status: ItemStatus;
    shop: { status: ShopStatus };
  }) {
    if (item.shop.status !== ShopStatus.active) {
      throw new ForbiddenException('Shop is not active');
    }
    if (item.status === ItemStatus.banned) {
      throw new ForbiddenException('Item is banned');
    }
  }
}
