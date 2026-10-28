import {
  BadRequestException,
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
  PromotionType,
  ShopStatus,
} from '@ecommerce/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import { variationName } from '../catalog/items.service.js';
import { emit } from '../notifications/outbox.service.js';
import { PAYMENT_WINDOW_MS, paymentCode } from '../payments/payment-code.js';
import { locationInclude, locationView } from '../regions/location.js';
import type { CheckoutDto, PreviewDto } from './dto/order.dto.js';
import {
  claimFlashSale,
  flashAllowance,
  runningFlashSale,
  type ActiveFlashSale,
} from '../promotions/flash-sales.js';
import { priceCart } from '../promotions/pricing.js';
import { VouchersService } from '../promotions/vouchers.service.js';
import { orderInclude, orderView } from './order-view.js';
import { shippingFee } from './shipping-fee.js';
import { coded } from '../../common/http-error.js';

const modelInclude = {
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
} satisfies Prisma.ModelInclude;

// A cart line, or the one flash sale line of a "buy now" checkout (sale is set only then).
interface Line {
  id: string;
  modelId: string;
  quantity: number;
  model: Prisma.ModelGetPayload<{ include: typeof modelInclude }>;
  sale?: ActiveFlashSale;
}

const unitPrice = (l: Line) => l.sale?.price ?? l.model.price;

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
      const { shops, vouchers } = await this.quote(tx, buyerId, dto, false);
      return {
        shops: shops.map(({ shop, priced }) => ({
          shop: { id: shop.id, name: shop.name, freeship: shop.freeship },
          itemsTotal: priced.itemsTotal,
          sellerDiscount: priced.sellerDiscount,
          platformDiscount: priced.platformDiscount,
          shippingFee: priced.shippingFee,
          shippingDiscount: priced.shippingDiscount,
          total: priced.total,
        })),
        total: shops.reduce((n, s) => n + s.priced.total, 0),
        shippingVoucher: vouchers.cart.shipping?.code ?? null,
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

    const lines = await this.lines(tx, buyerId, dto, lock);
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
    const carts = groups.map((g) => ({
      shopId: g.shop.id,
      shippingFee: g.fee,
      freeship: g.shop.freeship,
      lines: g.lines.map((l) => ({
        id: l.id,
        amount: unitPrice(l) * l.quantity,
      })),
    }));
    // Shops in the Freeship program get the best free-shipping voucher applied for the buyer.
    const commissionBps = this.vouchers.fees().commissionBps;
    if (!vouchers.cart.shipping && carts.some((c) => c.freeship)) {
      const draft = priceCart(carts, vouchers.cart, commissionBps);
      const auto = await this.vouchers.bestShipping(
        tx,
        buyerId,
        draft.reduce(
          (n, s) => n + s.itemsTotal - s.sellerDiscount - s.platformDiscount,
          0,
        ),
        draft.reduce(
          (n, s, i) => n + (carts[i].freeship ? s.shippingFee : 0),
          0,
        ),
      );
      // Kept only if the platform can still fund some of it on this checkout.
      if (
        auto &&
        priceCart(
          carts,
          { ...vouchers.cart, shipping: auto },
          commissionBps,
        ).some((s) => s.shippingDiscount > 0)
      ) {
        vouchers.cart.shipping = auto;
        vouchers.rows.push(auto);
      }
    }
    const priced = priceCart(carts, vouchers.cart, commissionBps);
    return {
      address,
      lines,
      vouchers,
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
    if (
      dto.expectedTotal !== undefined &&
      dto.expectedTotal !== checkoutTotal
    ) {
      throw new ConflictException({
        message: 'Prices changed, review the order again',
        total: checkoutTotal,
      });
    }
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
          coded('stock_short', `Not enough stock for ${line.model.item.name}`, {
            item: line.model.item.name,
          }),
        );
      }
      if (line.sale) await claimFlashSale(tx, line.sale, line.quantity);
    }

    const shippingAddress = {
      recipientName: address.recipientName,
      phone: address.phone,
      street: address.street,
      ...locationView(address),
    };
    for (const { shop, lines: shopLines, priced } of shops) {
      const discounts = new Map(priced.lines.map((l) => [l.id, l]));
      // Kept on the order, so it still shows after the voucher ends or its use is released.
      const vouchers = voucherRows.flatMap(({ promotion, ...v }) => {
        const amount =
          promotion.type === PromotionType.shop_voucher
            ? promotion.shopId === shop.id
              ? priced.sellerDiscount
              : 0
            : promotion.type === PromotionType.platform_voucher
              ? priced.platformDiscount
              : priced.shippingDiscount;
        return amount > 0
          ? [
              {
                type: promotion.type,
                name: promotion.name,
                code: v.code,
                discountKind: v.discountKind,
                discountValue: v.discountValue,
                maxDiscount: v.maxDiscount,
                minSpend: v.minSpend,
                amount,
              },
            ]
          : [];
      });
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
          freeshipFee: priced.freeshipFee,
          vouchers,
          shippingAddress,
          pickupAddress: {
            contactName: shop.contactName,
            phone: shop.phone,
            street: shop.street,
            ...locationView(shop),
          },
          items: {
            create: shopLines.map((line) => {
              const { model, quantity, sale } = line;
              const discount = discounts.get(line.id)!;
              return {
                modelId: model.id,
                itemName: model.item.name,
                modelName: variationName(
                  model.tierIndex,
                  model.item.tierVariations,
                ),
                sku: model.sku,
                imageKey: model.item.images[0]?.key,
                price: unitPrice(line),
                flashSaleModelId: sale?.id,
                originalPrice: sale && model.price,
                quantity,
                sellerDiscount: discount.sellerDiscount,
                platformDiscount: discount.platformDiscount,
              };
            }),
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
    if (dto.cartItemIds) {
      await tx.cartItem.deleteMany({ where: { id: { in: dto.cartItemIds } } });
    }
    return checkout.id;
  }

  private async lines(
    tx: Prisma.TransactionClient,
    buyerId: string,
    dto: PreviewDto,
    lock: boolean,
  ): Promise<Line[]> {
    if (!dto.cartItemIds === !dto.flashSale) {
      throw new BadRequestException('Send cart lines or a flash sale');
    }
    if (dto.flashSale) {
      const { quantity } = dto.flashSale;
      const { modelId, sale } = await runningFlashSale(
        tx,
        dto.flashSale.id,
        lock,
      );
      // Assumption: a flash sale is bought within its allowance only; more is refused, not charged at the regular price.
      const allowance = await flashAllowance(tx, buyerId, sale);
      if (quantity > allowance) {
        throw new ConflictException(
          coded(
            'flash_sale_allowance',
            `You can get ${allowance} more at the flash sale price`,
            { count: allowance },
          ),
        );
      }
      const model = await tx.model.findUniqueOrThrow({
        where: { id: modelId },
        include: modelInclude,
      });
      return [{ id: sale.id, modelId, quantity, model, sale }];
    }

    const ids = dto.cartItemIds!;
    if (lock) {
      // Lock cart lines first so a concurrent checkout of them fails instead of ordering twice.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM cart_items
        WHERE id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
          AND user_id = ${buyerId}::uuid
        FOR UPDATE`;
      if (locked.length !== ids.length) {
        throw new ConflictException('Cart changed, reload it');
      }
    }
    const lines = await tx.cartItem.findMany({
      where: { id: { in: ids }, userId: buyerId },
      include: { model: { include: modelInclude } },
    });
    if (lines.length !== ids.length) {
      throw new ConflictException('Cart changed, reload it');
    }
    return lines;
  }

  private assertPurchasable(buyerId: string, { model }: Line) {
    const { item } = model;
    if (
      model.deletedAt ||
      item.status !== ItemStatus.active ||
      item.shop.status !== ShopStatus.active
    ) {
      throw new ConflictException(
        coded('item_unavailable', `${item.name} is no longer available`, {
          item: item.name,
        }),
      );
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
