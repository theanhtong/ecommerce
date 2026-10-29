import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ItemStatus, Prisma, ShopStatus } from '@marketplace/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  available,
  publicWhere,
  variationName,
} from '../catalog/items.service.js';
import { mediaUrl } from '../storage/storage.service.js';
import type { AddCartItemDto } from './dto/cart-item.dto.js';
import { coded } from '../../common/http-error.js';

export const MAX_CART_MODELS = 200;

const lineInclude = {
  model: {
    include: {
      inventory: true,
      item: {
        include: {
          shop: { select: { id: true, name: true, status: true } },
          images: { orderBy: { position: 'asc' }, take: 1 },
          tierVariations: {
            orderBy: { position: 'asc' },
            include: { options: { orderBy: { position: 'asc' } } },
          },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude;

type Line = Prisma.CartItemGetPayload<{ include: typeof lineInclude }>;

const lineView = ({ model, ...line }: Line) => {
  const { item } = model;
  const stock = available(model);
  return {
    id: line.id,
    quantity: line.quantity,
    modelId: model.id,
    itemId: item.id,
    itemName: item.name,
    image: item.images[0] ? mediaUrl(item.images[0].key) : null,
    variation: variationName(model.tierIndex, item.tierVariations),
    addedPrice: line.addedPrice,
    price: model.price,
    priceChange: model.price - line.addedPrice,
    stock,
    purchasable:
      item.status === ItemStatus.active &&
      item.shop.status === ShopStatus.active &&
      stock >= line.quantity,
  };
};

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string) {
    const lines = await this.prisma.cartItem.findMany({
      where: { userId },
      include: lineInclude,
      orderBy: { updatedAt: 'desc' },
    });
    // Shops appear in the order of their most recently touched line.
    const shops = new Map<
      string,
      {
        shop: { id: string; name: string };
        items: ReturnType<typeof lineView>[];
      }
    >();
    for (const line of lines) {
      const { id, name } = line.model.item.shop;
      const group = shops.get(id) ?? { shop: { id, name }, items: [] };
      group.items.push(lineView(line));
      shops.set(id, group);
    }
    return { shops: [...shops.values()] };
  }

  async add(userId: string, dto: AddCartItemDto) {
    const model = await this.prisma.model.findFirst({
      where: { id: dto.modelId, deletedAt: null, item: publicWhere },
      include: { inventory: true, item: { include: { shop: true } } },
    });
    if (!model) throw new NotFoundException('Model not found');
    if (model.item.shop.ownerId === userId) {
      throw new ForbiddenException('You cannot buy from your own shop');
    }

    const existing = await this.prisma.cartItem.findUnique({
      where: { userId_modelId: { userId, modelId: model.id } },
    });
    if (!existing) {
      const lines = await this.prisma.cartItem.count({ where: { userId } });
      if (lines >= MAX_CART_MODELS) {
        throw new ConflictException('Cart is full');
      }
    }
    this.assertStock(
      (existing?.quantity ?? 0) + dto.quantity,
      available(model),
    );

    await this.prisma.cartItem.upsert({
      where: { userId_modelId: { userId, modelId: model.id } },
      create: {
        userId,
        modelId: model.id,
        quantity: dto.quantity,
        addedPrice: model.price,
      },
      // Adding again means the buyer accepted the current price.
      update: {
        quantity: { increment: dto.quantity },
        addedPrice: model.price,
      },
    });
    return this.get(userId);
  }

  async update(userId: string, id: string, quantity: number) {
    const line = await this.prisma.cartItem.findFirst({
      where: { id, userId },
      include: { model: { include: { inventory: true } } },
    });
    if (!line) throw new NotFoundException('Cart item not found');
    this.assertStock(quantity, available(line.model));
    await this.prisma.cartItem.update({ where: { id }, data: { quantity } });
    return this.get(userId);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.cartItem.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('Cart item not found');
    return this.get(userId);
  }

  private assertStock(quantity: number, stock: number) {
    if (quantity > stock) {
      throw new ConflictException(
        coded('stock_left', `Only ${stock} left in stock`, { stock }),
      );
    }
  }
}
