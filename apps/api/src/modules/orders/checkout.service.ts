import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InventoryReason,
  ItemStatus,
  OrderStatus,
  Prisma,
  ShopStatus,
} from '@ecommerce/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { variationName } from '../catalog/items.service.js';
import { locationInclude, locationView } from '../regions/location.js';
import type { CheckoutDto } from './dto/order.dto.js';
import { orderInclude, orderView } from './order-view.js';
import { shippingFee } from './shipping-fee.js';

const lineInclude = {
  model: {
    include: {
      item: {
        include: {
          shop: { include: { address: { include: locationInclude } } },
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

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async checkout(buyerId: string, dto: CheckoutDto, idempotencyKey: string) {
    const replay = await this.findCheckout(buyerId, idempotencyKey);
    if (replay) return replay;
    try {
      const checkoutId = await this.prisma.$transaction((tx) =>
        this.place(tx, buyerId, dto, idempotencyKey),
      );
      return (await this.findCheckout(buyerId, idempotencyKey, checkoutId))!;
    } catch (error) {
      // A concurrent request with the same key took the cart lines or the checkout row first.
      const winner = await this.findCheckout(buyerId, idempotencyKey);
      if (winner) return winner;
      throw error;
    }
  }

  private async place(
    tx: Prisma.TransactionClient,
    buyerId: string,
    dto: CheckoutDto,
    idempotencyKey: string,
  ) {
    const address = await tx.address.findFirst({
      where: { id: dto.addressId, userId: buyerId },
      include: locationInclude,
    });
    if (!address) throw new NotFoundException('Address not found');

    // Lock the cart lines first: a concurrent checkout of the same lines waits here,
    // then finds them gone and fails instead of placing a second order.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM cart_items
      WHERE id IN (${Prisma.join(dto.cartItemIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND user_id = ${buyerId}::uuid
      FOR UPDATE`;
    if (locked.length !== dto.cartItemIds.length) {
      throw new ConflictException('Cart changed, reload it');
    }
    const lines = await tx.cartItem.findMany({
      where: { id: { in: dto.cartItemIds } },
      include: lineInclude,
    });
    for (const line of lines) this.assertPurchasable(buyerId, line);

    const checkout = await tx.checkout.create({
      data: { buyerId, idempotencyKey },
    });

    for (const line of [...lines].sort((a, b) =>
      a.modelId.localeCompare(b.modelId),
    )) {
      const reserved = await tx.$executeRaw`
        UPDATE inventory
        SET reserved = reserved + ${line.quantity}, updated_at = now()
        WHERE model_id = ${line.modelId}::uuid
          AND on_hand - reserved >= ${line.quantity}`;
      if (reserved === 0) {
        throw new ConflictException(
          `Not enough stock for ${line.model.item.name}`,
        );
      }
    }

    const shippingAddress = {
      recipientName: address.recipientName,
      phone: address.phone,
      street: address.street,
      ...locationView(address),
    };
    const byShop = new Map<string, Line[]>();
    for (const line of lines) {
      const shopId = line.model.item.shopId;
      byShop.set(shopId, [...(byShop.get(shopId) ?? []), line]);
    }
    for (const shopLines of byShop.values()) {
      const { shop } = shopLines[0].model.item;
      const pickup = shop.address!;
      const itemsTotal = shopLines.reduce(
        (sum, l) => sum + l.model.price * l.quantity,
        0,
      );
      const weight = shopLines.reduce(
        (sum, l) => sum + l.model.item.weight * l.quantity,
        0,
      );
      const fee = shippingFee(
        {
          fromProvinceCode: pickup.ward.provinceCode,
          toProvinceCode: address.ward.provinceCode,
          toWardType: address.ward.type,
        },
        weight,
      );

      const order = await tx.order.create({
        data: {
          checkoutId: checkout.id,
          buyerId,
          shopId: shop.id,
          itemsTotal,
          shippingFee: fee,
          total: itemsTotal + fee,
          shippingAddress,
          pickupAddress: {
            contactName: pickup.contactName,
            phone: pickup.phone,
            street: pickup.street,
            ...locationView(pickup),
          },
          items: {
            create: shopLines.map(({ model, quantity }) => ({
              modelId: model.id,
              itemName: model.item.name,
              modelName: variationName(
                model.tierIndex,
                model.item.tierVariations,
              ),
              sku: model.sku,
              price: model.price,
              quantity,
            })),
          },
          history: {
            create: { toStatus: OrderStatus.to_ship, actorId: buyerId },
          },
        },
      });
      await tx.inventoryMovement.createMany({
        data: shopLines.map((l) => ({
          modelId: l.modelId,
          delta: l.quantity,
          reason: InventoryReason.reserve,
          refType: 'order',
          refId: order.id,
          actorId: buyerId,
        })),
      });
    }

    await tx.cartItem.deleteMany({ where: { id: { in: dto.cartItemIds } } });
    return checkout.id;
  }

  private assertPurchasable(buyerId: string, { model }: Line) {
    const { item } = model;
    if (
      model.deletedAt ||
      item.status !== ItemStatus.active ||
      item.shop.status !== ShopStatus.active
    ) {
      throw new ConflictException(`${item.name} is no longer available`);
    }
    if (item.shop.ownerId === buyerId) {
      throw new ForbiddenException('You cannot buy from your own shop');
    }
    if (!item.shop.address) {
      throw new ConflictException(`${item.shop.name} cannot ship orders yet`);
    }
  }

  private async findCheckout(
    buyerId: string,
    idempotencyKey: string,
    id?: string,
  ) {
    const checkout = await this.prisma.checkout.findFirst({
      where: id ? { id } : { buyerId, idempotencyKey },
      include: { orders: { include: orderInclude, orderBy: { id: 'asc' } } },
    });
    return (
      checkout && {
        checkoutId: checkout.id,
        orders: checkout.orders.map(orderView),
      }
    );
  }
}
