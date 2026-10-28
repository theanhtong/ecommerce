import { BadRequestException } from '@nestjs/common';

export interface VoucherTerms {
  code: string;
  discountKind: 'fixed' | 'percent';
  discountValue: number;
  maxDiscount: number | null;
  minSpend: number;
}

export interface ShopCart {
  shopId: string;
  lines: { id: string; amount: number }[];
  shippingFee: number;
  // In the shop-funded Freeship program.
  freeship: boolean;
}

// Assumption: the Freeship program fee is 6% of the shop's revenue on the order, at most 50,000₫,
// as GHN's seller blog reports for TikTok Shop's Freeship Extra; set the platform's own rate later.
export const FREESHIP_FEE_BPS = 600;
export const FREESHIP_FEE_CAP = 50_000;

export const freeshipFee = (revenue: number) =>
  Math.min(FREESHIP_FEE_CAP, Math.round((revenue * FREESHIP_FEE_BPS) / 10_000));

// Assumption: a platform-funded voucher may not cost more than the platform earns on an order
// that just meets its minimum spend: commission, plus the Freeship fee for shipping vouchers.
export function platformVoucherLimit(
  type: 'platform_voucher' | 'shipping_voucher',
  minSpend: number,
  commissionBps: number,
) {
  return (
    Math.round((minSpend * commissionBps) / 10_000) +
    (type === 'shipping_voucher' ? freeshipFee(minSpend) : 0)
  );
}

// Null when the voucher fits the limit; otherwise the limit it breaks.
export function platformVoucherExcess(
  type: 'platform_voucher' | 'shipping_voucher',
  v: Omit<VoucherTerms, 'code'>,
  commissionBps: number,
) {
  // A percent off the order never outruns a commission of at least that percent.
  if (
    type === 'platform_voucher' &&
    v.discountKind === 'percent' &&
    v.discountValue * 100 <= commissionBps
  ) {
    return null;
  }
  const limit = platformVoucherLimit(type, v.minSpend, commissionBps);
  const most =
    v.discountKind === 'fixed' ? v.discountValue : (v.maxDiscount ?? Infinity);
  return most > limit ? limit : null;
}

export interface CartVouchers {
  shop: Map<string, VoucherTerms>;
  platform?: VoucherTerms;
  shipping?: VoucherTerms;
}

export const discountFor = (v: VoucherTerms, base: number) =>
  Math.min(
    base,
    v.maxDiscount ?? Infinity,
    v.discountKind === 'fixed'
      ? v.discountValue
      : Math.floor((base * v.discountValue) / 100),
  );

// Splits total in proportion to weights; largest remainders take the leftover đồng, so parts sum to total.
export function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum) return weights.map(() => 0);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => [x - Math.floor(x), i] as const)
    .sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (!left) break;
    parts[i]++;
    left--;
  }
  return parts;
}

function requireSpend(v: VoucherTerms, base: number) {
  if (base < v.minSpend) {
    throw new BadRequestException(
      `Voucher ${v.code} needs a minimum spend of ${v.minSpend}`,
    );
  }
}

// Shop vouchers apply first, the platform voucher to what is left, and the shipping
// voucher only to shipping fees. Assumption: each minimum spend is checked against the
// amount its voucher applies to.
// Assumption: with `commissionBps`, the platform never funds more on one checkout than it earns on it
// (commission plus Freeship fees); the platform voucher is served first, the shipping voucher gets
// what is left.
export function priceCart(
  shops: ShopCart[],
  vouchers: CartVouchers,
  commissionBps?: number,
) {
  const priced = shops.map((s) => {
    const itemsTotal = s.lines.reduce((n, l) => n + l.amount, 0);
    const voucher = vouchers.shop.get(s.shopId);
    if (voucher) requireSpend(voucher, itemsTotal);
    const sellerDiscount = voucher ? discountFor(voucher, itemsTotal) : 0;
    const sellerLines = allocate(
      sellerDiscount,
      s.lines.map((l) => l.amount),
    );
    return { ...s, itemsTotal, sellerDiscount, sellerLines };
  });

  const afterShop = priced.map((s) => s.itemsTotal - s.sellerDiscount);
  const platformBase = afterShop.reduce((a, b) => a + b, 0);
  if (vouchers.platform) requireSpend(vouchers.platform, platformBase);
  let budget =
    commissionBps === undefined
      ? Infinity
      : priced.reduce(
          (n, s, i) =>
            n +
            Math.round((afterShop[i] * commissionBps) / 10_000) +
            (s.freeship ? freeshipFee(afterShop[i]) : 0),
          0,
        );
  const platformTotal = Math.min(
    budget,
    vouchers.platform ? discountFor(vouchers.platform, platformBase) : 0,
    afterShop,
  );

  // Shipping vouchers only cover shops in the Freeship program, which fund them through its fee.
  const fees = priced.map((s) => (s.freeship ? s.shippingFee : 0));
  const shippingBase = sum(fees);
  budget -= platformTotal;
  const platformByShop = allocate(platformTotal, afterShop);
  if (vouchers.shipping) {
    if (!shippingBase) {
      throw new BadRequestException(
        `Voucher ${vouchers.shipping.code} only covers shops in the Freeship program`,
      );
    }
    requireSpend(vouchers.shipping, platformBase - sum(platformByShop));
  }
  const shippingByShop = allocate(
    Math.min(
      budget,
      vouchers.shipping ? discountFor(vouchers.shipping, shippingBase) : 0,
    ),
    fees,
  );

  return priced.map((s, i) => {
    const platformLines = allocate(
      platformByShop[i],
      s.lines.map((l, j) => l.amount - s.sellerLines[j]),
    );
    const platformDiscount = platformByShop[i];
    const shippingDiscount = shippingByShop[i];
    return {
      shopId: s.shopId,
      itemsTotal: s.itemsTotal,
      sellerDiscount: s.sellerDiscount,
      platformDiscount,
      shippingFee: s.shippingFee,
      shippingDiscount,
      freeshipFee: s.freeship
        ? freeshipFee(s.itemsTotal - s.sellerDiscount)
        : 0,
      total:
        s.itemsTotal -
        s.sellerDiscount -
        platformDiscount +
        s.shippingFee -
        shippingDiscount,
      lines: s.lines.map((l, j) => ({
        id: l.id,
        sellerDiscount: s.sellerLines[j],
        platformDiscount: platformLines[j],
      })),
    };
  });
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
