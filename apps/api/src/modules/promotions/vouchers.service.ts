import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PromotionType } from '@ecommerce/db';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreatePlatformVoucherDto,
  CreateVoucherDto,
} from './dto/voucher.dto.js';
import { commissionRateBps } from '../ledger/ledger.service.js';
import {
  discountFor,
  FREESHIP_FEE_BPS,
  FREESHIP_FEE_CAP,
  platformVoucherExcess,
  type CartVouchers,
} from './pricing.js';
import { coded } from '../../common/http-error.js';

const voucherInclude = { promotion: true } satisfies Prisma.VoucherInclude;
type VoucherRow = Prisma.VoucherGetPayload<{ include: typeof voucherInclude }>;

const voucherView = ({ promotion, ...v }: VoucherRow) => ({
  id: v.promotionId,
  type: promotion.type,
  shopId: promotion.shopId,
  name: promotion.name,
  code: v.code,
  discountKind: v.discountKind,
  discountValue: v.discountValue,
  maxDiscount: v.maxDiscount,
  minSpend: v.minSpend,
  usageLimit: v.usageLimit,
  usedCount: v.usedCount,
  startsAt: promotion.startsAt,
  endsAt: promotion.endsAt,
});

const live = (now: Date) =>
  ({
    promotion: { startsAt: { lte: now }, endsAt: { gt: now } },
  }) satisfies Prisma.VoucherWhereInput;

@Injectable()
export class VouchersService {
  private readonly commissionBps = commissionRateBps();

  constructor(private readonly prisma: PrismaService) {}

  fees() {
    return {
      commissionBps: this.commissionBps,
      freeshipFeeBps: FREESHIP_FEE_BPS,
      freeshipFeeCap: FREESHIP_FEE_CAP,
    };
  }

  // Turns the codes a buyer entered into the vouchers the cart may use: at most one shop
  // voucher per shop, one platform voucher and one shipping voucher.
  async resolve(
    tx: Prisma.TransactionClient,
    buyerId: string,
    codes: string[],
    shopIds: string[],
    now = new Date(),
  ) {
    const wanted = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
    const rows = await tx.voucher.findMany({
      where: { code: { in: wanted }, ...live(now) },
      include: voucherInclude,
    });
    const missing = wanted.find((c) => !rows.some((r) => r.code === c));
    if (missing) {
      throw new ConflictException(
        coded('voucher_unavailable', `Voucher ${missing} is not available`, {
          voucher: missing,
        }),
      );
    }

    const cart: CartVouchers = { shop: new Map() };
    for (const row of rows) {
      const { type, shopId } = row.promotion;
      if (type === PromotionType.shop_voucher) {
        if (!shopIds.includes(shopId!)) {
          throw new BadRequestException(
            coded(
              'voucher_wrong_shop',
              `Voucher ${row.code} is for a shop not in this order`,
              { voucher: row.code },
            ),
          );
        }
        if (cart.shop.has(shopId!)) {
          throw new BadRequestException('Only one voucher per shop');
        }
        cart.shop.set(shopId!, row);
      } else {
        const slot =
          type === PromotionType.platform_voucher ? 'platform' : 'shipping';
        if (cart[slot]) {
          throw new BadRequestException(
            coded('voucher_one_per_type', `Only one ${type.replace('_', ' ')}`),
          );
        }
        cart[slot] = row;
      }
    }

    const used = await tx.voucherUsage.findFirst({
      where: { userId: buyerId, voucher: { code: { in: wanted } } },
      include: { voucher: true },
    });
    if (used) {
      throw new ConflictException(
        coded('voucher_used', `Voucher ${used.voucher.code} already used`, {
          voucher: used.voucher.code,
        }),
      );
    }
    return { cart, rows };
  }

  // Takes one use of each voucher; the conditional update keeps used_count within the limit.
  async claim(
    tx: Prisma.TransactionClient,
    buyerId: string,
    checkoutId: string,
    rows: { promotionId: string; code: string }[],
  ) {
    for (const row of rows) {
      const taken = await tx.$executeRaw`
        UPDATE vouchers SET used_count = used_count + 1
        WHERE promotion_id = ${row.promotionId}::uuid AND used_count < usage_limit`;
      if (!taken)
        throw new ConflictException(
          coded('voucher_used_up', `Voucher ${row.code} is used up`, {
            voucher: row.code,
          }),
        );
      const { count } = await tx.voucherUsage.createMany({
        data: { voucherId: row.promotionId, userId: buyerId, checkoutId },
        skipDuplicates: true,
      });
      if (!count) {
        throw new ConflictException(
          coded('voucher_used', `Voucher ${row.code} already used`, {
            voucher: row.code,
          }),
        );
      }
    }
  }

  // A platform voucher comes back once every order it paid for is cancelled, if it is still
  // valid; shop and shipping vouchers never do.
  async releaseIfCancelled(
    tx: Prisma.TransactionClient,
    checkoutId: string,
    now = new Date(),
  ) {
    const [usage] = await tx.$queryRaw<{ id: string; voucher_id: string }[]>`
      SELECT u.id, u.voucher_id FROM voucher_usages u
      JOIN promotions p ON p.id = u.voucher_id
      WHERE u.checkout_id = ${checkoutId}::uuid
        AND p.type = 'platform_voucher' AND p.ends_at > ${now}
      FOR UPDATE OF u`;
    if (!usage) return;
    const open = await tx.order.count({
      where: { checkoutId, status: { notIn: ['cancelled', 'returned'] } },
    });
    if (open) return;
    await tx.voucherUsage.delete({ where: { id: usage.id } });
    await tx.voucher.update({
      where: { promotionId: usage.voucher_id },
      data: { usedCount: { decrement: 1 } },
    });
  }

  // The free-shipping voucher that takes the most off `fees`, among those the buyer can still use
  // and whose minimum `base` meets; null when none fits.
  async bestShipping(
    tx: Prisma.TransactionClient,
    buyerId: string,
    base: number,
    fees: number,
    now = new Date(),
  ) {
    const rows = await tx.voucher.findMany({
      where: {
        ...live(now),
        promotion: {
          type: PromotionType.shipping_voucher,
          ...live(now).promotion,
        },
        usedCount: { lt: tx.voucher.fields.usageLimit },
        usages: { none: { userId: buyerId } },
        minSpend: { lte: base },
      },
      include: voucherInclude,
    });
    return (
      rows.sort((a, b) => discountFor(b, fees) - discountFor(a, fees))[0] ??
      null
    );
  }

  // Vouchers a buyer could apply to a cart from these shops right now.
  async available(buyerId: string, shopIds: string[], now = new Date()) {
    const rows = await this.prisma.voucher.findMany({
      where: {
        ...live(now),
        usedCount: { lt: this.prisma.voucher.fields.usageLimit },
        usages: { none: { userId: buyerId } },
        OR: [
          { promotion: { type: { not: PromotionType.shop_voucher } } },
          { promotion: { shopId: { in: shopIds } } },
        ],
      },
      include: voucherInclude,
      orderBy: { promotion: { endsAt: 'asc' } },
    });
    return rows.map(voucherView);
  }

  async createForShop(ownerId: string, dto: CreateVoucherDto) {
    const shop = await this.ownShop(ownerId);
    return this.create(PromotionType.shop_voucher, shop.id, dto);
  }

  createForPlatform({ type, ...dto }: CreatePlatformVoucherDto) {
    const limit = platformVoucherExcess(
      type,
      { ...dto, maxDiscount: dto.maxDiscount ?? null },
      this.commissionBps,
    );
    if (limit !== null) {
      throw new BadRequestException(
        coded(
          'voucher_over_limit',
          `At this minimum spend the discount must be capped at ${limit}`,
          { limit },
        ),
      );
    }
    return this.create(type, null, dto);
  }

  async listForShop(ownerId: string) {
    const shop = await this.ownShop(ownerId);
    return this.list({ promotion: { shopId: shop.id } });
  }

  listForPlatform() {
    return this.list({
      promotion: { type: { not: PromotionType.shop_voucher } },
    });
  }

  async endForShop(ownerId: string, id: string) {
    const shop = await this.ownShop(ownerId);
    return this.end(id, { shopId: shop.id });
  }

  endForPlatform(id: string) {
    return this.end(id, { type: { not: PromotionType.shop_voucher } });
  }

  private async create(
    type: PromotionType,
    shopId: string | null,
    dto: CreateVoucherDto,
  ) {
    if (dto.endsAt <= dto.startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }
    if (dto.discountKind === 'percent' && dto.discountValue > 100) {
      throw new BadRequestException('A percent discount is at most 100');
    }
    try {
      const promotion = await this.prisma.promotion.create({
        data: {
          type,
          shopId,
          name: dto.name,
          startsAt: dto.startsAt,
          endsAt: dto.endsAt,
          voucher: {
            create: {
              code: dto.code,
              discountKind: dto.discountKind,
              discountValue: dto.discountValue,
              maxDiscount:
                dto.discountKind === 'percent'
                  ? (dto.maxDiscount ?? null)
                  : null,
              minSpend: dto.minSpend,
              usageLimit: dto.usageLimit,
            },
          },
        },
        include: { voucher: { include: voucherInclude } },
      });
      return voucherView(promotion.voucher!);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Voucher code already exists');
      }
      throw error;
    }
  }

  private async list(where: Prisma.VoucherWhereInput) {
    const rows = await this.prisma.voucher.findMany({
      where,
      include: voucherInclude,
      orderBy: { promotionId: 'desc' },
    });
    return rows.map(voucherView);
  }

  // Ends a running or scheduled voucher now; vouchers already used stay on their orders.
  private async end(id: string, owner: Prisma.PromotionWhereInput) {
    const now = new Date();
    const promotion = await this.prisma.promotion.findFirst({
      where: { id, ...owner, voucher: { isNot: null } },
    });
    if (!promotion) throw new NotFoundException('Voucher not found');
    if (promotion.endsAt <= now) {
      throw new ConflictException('Voucher has already ended');
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
    return voucherView(
      await this.prisma.voucher.findUniqueOrThrow({
        where: { promotionId: id },
        include: voucherInclude,
      }),
    );
  }

  private async ownShop(ownerId: string) {
    const shop = await this.prisma.shop.findUnique({ where: { ownerId } });
    if (!shop) throw new NotFoundException('You do not have a shop');
    return shop;
  }
}
