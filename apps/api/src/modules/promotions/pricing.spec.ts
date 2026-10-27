import { allocate, priceCart, type VoucherTerms } from './pricing.js';

const voucher = (v: Partial<VoucherTerms>): VoucherTerms => ({
  code: 'V',
  discountKind: 'fixed',
  discountValue: 0,
  maxDiscount: null,
  minSpend: 0,
  ...v,
});

describe('allocate', () => {
  it('splits in proportion and always sums to the total', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(10, [70000, 30000])).toEqual([7, 3]);
    expect(allocate(0, [5, 5])).toEqual([0, 0]);
    expect(allocate(7, [0, 0])).toEqual([0, 0]);
  });
});

describe('priceCart', () => {
  const cart = [
    {
      shopId: 'a',
      lines: [
        { id: 'a1', amount: 100000 },
        { id: 'a2', amount: 50000 },
      ],
      shippingFee: 20000,
    },
    { shopId: 'b', lines: [{ id: 'b1', amount: 50000 }], shippingFee: 30000 },
  ];

  it('applies shop, then platform, then shipping vouchers', () => {
    const [a, b] = priceCart(cart, {
      shop: new Map([['a', voucher({ discountValue: 30000 })]]),
      platform: voucher({
        discountKind: 'percent',
        discountValue: 10,
        maxDiscount: 15000,
      }),
      shipping: voucher({ discountValue: 40000 }),
    });

    expect(a).toMatchObject({
      itemsTotal: 150000,
      sellerDiscount: 30000,
      shippingDiscount: 16000,
    });
    // 10% of 170000 is 17000, capped at 15000, split 120000:50000 between shops.
    expect(a.platformDiscount + b.platformDiscount).toBe(15000);
    expect(a.platformDiscount).toBe(10588);
    // Free shipping is capped at the 50000 of fees and split 20000:30000.
    expect(b.shippingDiscount).toBe(24000);
    expect(a.total).toBe(150000 - 30000 - 10588 + 20000 - 16000);
    expect(a.lines.reduce((n, l) => n + l.sellerDiscount, 0)).toBe(30000);
    expect(a.lines.reduce((n, l) => n + l.platformDiscount, 0)).toBe(10588);
  });

  it('never discounts more than the amount it applies to', () => {
    const [a] = priceCart([cart[1]], {
      shop: new Map([['b', voucher({ discountValue: 999999 })]]),
      shipping: voucher({ discountKind: 'percent', discountValue: 100 }),
    });
    expect(a).toMatchObject({
      sellerDiscount: 50000,
      shippingDiscount: 30000,
      total: 0,
    });
  });

  it('refuses a voucher whose minimum spend is not met', () => {
    expect(() =>
      priceCart(cart, {
        shop: new Map(),
        platform: voucher({ code: 'BIG', minSpend: 500000 }),
      }),
    ).toThrow('Voucher BIG needs a minimum spend of 500000');
  });
});
