import type { WardType } from '@marketplace/db';

// Assumption: every 500 g above 2 kg adds one step, priced by whether that step ends above 4 kg.
const RATES = {
  sameProvince: {
    urban: [{ upTo: 2000, fee: 16_500 }],
    rural: [{ upTo: 2000, fee: 23_375 }],
    step: { upTo4kg: 2_750, above4kg: 4_125 },
  },
  otherProvince: {
    base: [
      { upTo: 500, fee: 23_900 },
      { upTo: 1000, fee: 25_228 },
      { upTo: 2000, fee: 27_884 },
    ],
    step: { upTo4kg: 4_647, above4kg: 6_639 },
  },
};

const BASE_LIMIT = 2000;
const STEP = 500;

export interface ShippingRoute {
  fromProvinceCode: string;
  toProvinceCode: string;
  toWardType: WardType;
}

// shortcut: actual weight only; add volumetric weight (L×W×H/5000) once items carry package dimensions.
export function shippingFee(route: ShippingRoute, weightGrams: number) {
  if (!Number.isInteger(weightGrams) || weightGrams <= 0) {
    throw new RangeError('weight must be a positive integer');
  }
  const same = route.fromProvinceCode === route.toProvinceCode;
  const base = same
    ? RATES.sameProvince[route.toWardType === 'ward' ? 'urban' : 'rural']
    : RATES.otherProvince.base;
  const step = same ? RATES.sameProvince.step : RATES.otherProvince.step;

  const tier = base.find((t) => weightGrams <= t.upTo);
  if (tier) return tier.fee;

  let fee = base[base.length - 1].fee;
  for (let w = BASE_LIMIT + STEP; w - STEP < weightGrams; w += STEP) {
    fee += w <= 4000 ? step.upTo4kg : step.above4kg;
  }
  return fee;
}
