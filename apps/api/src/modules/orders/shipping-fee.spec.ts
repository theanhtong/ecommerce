import { shippingFee, type ShippingRoute } from './shipping-fee.js';

const inHanoi = (toWardType: ShippingRoute['toWardType']): ShippingRoute => ({
  fromProvinceCode: '01',
  toProvinceCode: '01',
  toWardType,
});
const hanoiToHcm: ShippingRoute = {
  fromProvinceCode: '01',
  toProvinceCode: '79',
  toWardType: 'ward',
};

describe('shippingFee', () => {
  it('charges a flat fee up to 2 kg within a province', () => {
    expect(shippingFee(inHanoi('ward'), 1)).toBe(16_500);
    expect(shippingFee(inHanoi('ward'), 2000)).toBe(16_500);
    expect(shippingFee(inHanoi('commune'), 2000)).toBe(23_375);
    expect(shippingFee(inHanoi('special_zone'), 300)).toBe(23_375);
  });

  it('uses weight tiers up to 2 kg between provinces', () => {
    expect(shippingFee(hanoiToHcm, 500)).toBe(23_900);
    expect(shippingFee(hanoiToHcm, 501)).toBe(25_228);
    expect(shippingFee(hanoiToHcm, 1000)).toBe(25_228);
    expect(shippingFee(hanoiToHcm, 2000)).toBe(27_884);
  });

  it('adds a step per started 500 g above 2 kg, dearer above 4 kg', () => {
    expect(shippingFee(inHanoi('ward'), 2001)).toBe(16_500 + 2_750);
    expect(shippingFee(inHanoi('ward'), 4000)).toBe(16_500 + 4 * 2_750);
    expect(shippingFee(inHanoi('ward'), 4001)).toBe(16_500 + 4 * 2_750 + 4_125);
    expect(shippingFee(hanoiToHcm, 5000)).toBe(27_884 + 4 * 4_647 + 2 * 6_639);
  });

  it('rejects a non-positive weight', () => {
    expect(() => shippingFee(hanoiToHcm, 0)).toThrow(RangeError);
    expect(() => shippingFee(hanoiToHcm, 1.5)).toThrow(RangeError);
  });
});
