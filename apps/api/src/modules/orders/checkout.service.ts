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
  PaymentMethod,
  Prisma,
  ShopStatus,
} from '@ecommerce/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { variationName } from '../catalog/items.service.js';
import { emit } from '../notifications/outbox.service.js';
import { PAYMENT_WINDOW_MS, paymentCode } from '../payments/payment-code.js';
import { locationInclude, locationView } from '../regions/location.js';
import type { CheckoutDto, PreviewDto } from './dto/order.dto.js';
import { priceCart } from '../promotions/pricing.js';
import { VouchersService } from '../promotions/vouchers.service.js';
import { orderInclude, orderView } from './order-view.js';
import { shippingFee } from './shipping-fee.js';

const lineInclude = {
  model: {
    include: {
      item: {
        include: {
          shop: { include: locationInclude },
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

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vouchers: VouchersService,
  ) {}

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

  async preview(buyerId: string, dto: PreviewDto) {
    return this.prisma.$transaction(async (tx) => {
      const { shops } = await this.quote(tx, buyerId, dto, false);
      return {
        shops: shops.map(({ shop, priced }) => ({
          shop: { id: shop.id, name: shop.name },
          itemsTotal: priced.itemsTotal,
          sellerDiscount: priced.sellerDiscount,
          platformDiscount: priced.platformDiscount,
          shippingFee: priced.shippingFee,
          shippingDiscount: priced.shippingDiscount,
          total: priced.total,
        })),
        total: shops.reduce((n, s) => n + s.priced.total, 0),
      };
    });
  }

  // Prices the selected cart lines with their vouchers; place() locks the lines first.
  private async quote(
    tx: Prisma.TransactionClient,
    buyerId: string,
    dto: PreviewDto,
    lock: boolean,
  ) {
    const address = await tx.address.findFirst({
      where: { id: dto.addressId, userId: buyerId },
      include: locationInclude,
    });
    if (!address) throw new NotFoundException('Address not found');

    if (lock) {
      // Lock cart lines first so a concurrent checkout of them fails instead of ordering twice.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM cart_items
        WHERE id IN (${Prisma.join(dto.cartItemIds.map((id) => Prisma.sql`${id}::uuid`))})
          AND user_id = ${buyerId}::uuid
        FOR UPDATE`;
      if (locked.length !== dto.cartItemIds.length) {
        throw new ConflictException('Cart changed, reload it');
      }
    }
    const lines = await tx.cartItem.findMany({
      where: { id: { in: dto.cartItemIds }, userId: buyerId },
      include: lineInclude,
    });
    if (lines.length !== dto.cartItemIds.length) {
      throw new ConflictException('Cart changed, reload it');
    }
    for (const line of lines) this.assertPurchasable(buyerId, line);

    const byShop = new Map<string, Line[]>();
    for (const line of lines) {
      const shopId = line.model.item.shopId;
      byShop.set(shopId, [...(byShop.get(shopId) ?? []), line]);
    }
    const groups = [...byShop.values()].map((shopLines) => {
      const { shop } = shopLines[0].model.item;
      const weight = shopLines.reduce(
        (sum, l) => sum + l.model.item.weight * l.quantity,
        0,
      );
      const fee = shippingFee(
        {
          fromProvinceCode: shop.ward.provinceCode,
          toProvinceCode: address.ward.provinceCode,
          toWardType: address.ward.type,
        },
        weight,
      );
      return { shop, lines: shopLines, fee };
    });

    const vouchers = await this.vouchers.resolve(
      tx,
      buyerId,
      dto.voucherCodes ?? [],
      groups.map((g) => g.shop.id),
    );
    const priced = priceCart(
      groups.map((g) => ({
        shopId: g.shop.id,
        shippingFee: g.fee,
        lines: g.lines.map((l) => ({
          id: l.id,
          amount: l.model.price * l.quantity,
        })),
      })),
      vouchers.cart,
    );
    return {
      address,
      lines,
      voucherRows: vouchers.rows,
      shops: groups.map((g, i) => ({ ...g, priced: priced[i] })),
    };
  }

  private async place(
    tx: Prisma.TransactionClient,
    buyerId: string,
    dto: CheckoutDto,
    idempotencyKey: string,
  ) {
    const { address, lines, shops, voucherRows } = await this.quote(
      tx,
      buyerId,
      dto,
      true,
    );
    const checkoutTotal = shops.reduce((n, s) => n + s.priced.total, 0);
    // Cash on delivery can ship right away; online orders wait for payment, holding their stock.
    const awaitsPayment =
      dto.paymentMethod === PaymentMethod.online && checkoutTotal > 0;
    const initialStatus = awaitsPayment
      ? OrderStatus.unpaid
      : OrderStatus.to_ship;

    const checkout = await tx.checkout.create({
      data: { buyerId, idempotencyKey, paymentMethod: dto.paymentMethod },
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
    for (const { shop, lines: shopLines, priced } of shops) {
      const discounts = new Map(priced.lines.map((l) => [l.id, l]));
      const order = await tx.order.create({
        data: {
          checkoutId: checkout.id,
          buyerId,
          shopId: shop.id,
          status: initialStatus,
          itemsTotal: priced.itemsTotal,
          sellerDiscount: priced.sellerDiscount,
          platformDiscount: priced.platformDiscount,
          shippingFee: priced.shippingFee,
          shippingDiscount: priced.shippingDiscount,
          total: priced.total,
          shippingAddress,
          pickupAddress: {
            contactName: shop.contactName,
            phone: shop.phone,
            street: shop.street,
            ...locationView(shop),
          },
          items: {
            create: shopLines.map(({ id, model, quantity }) => ({
              modelId: model.id,
              itemName: model.item.name,
              modelName: variationName(
                model.tierIndex,
                model.item.tierVariations,
              ),
              sku: model.sku,
              imageKey: model.item.images[0]?.key,
              price: model.price,
              quantity,
              sellerDiscount: discounts.get(id)!.sellerDiscount,
              platformDiscount: discounts.get(id)!.platformDiscount,
            })),
          },
          history: {
            create: { toStatus: initialStatus, actorId: buyerId },
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
      await emit(tx, {
        type: 'order.status_changed',
        payload: {
          orderId: order.id,
          from: null,
          to: initialStatus,
          actorId: buyerId,
        },
      });
    }
    await this.vouchers.claim(tx, buyerId, checkout.id, voucherRows);

    if (awaitsPayment) {
      await tx.payment.create({
        data: {
          checkoutId: checkout.id,
          code: paymentCode(),
          amount: checkoutTotal,
          expiresAt: new Date(Date.now() + PAYMENT_WINDOW_MS),
        },
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
