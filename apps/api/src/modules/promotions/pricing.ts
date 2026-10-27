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
export function priceCart(shops: ShopCart[], vouchers: CartVouchers) {
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
  const platformByShop = allocate(
    vouchers.platform ? discountFor(vouchers.platform, platformBase) : 0,
    afterShop,
  );

  const fees = priced.map((s) => s.shippingFee);
  const shippingBase = fees.reduce((a, b) => a + b, 0);
  if (vouchers.shipping) {
    requireSpend(vouchers.shipping, platformBase - sum(platformByShop));
  }
  const shippingByShop = allocate(
    vouchers.shipping ? discountFor(vouchers.shipping, shippingBase) : 0,
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
