import { validateVariations } from './variations.js';

const color = { name: 'Màu', options: ['Đỏ', 'Xanh'] };
const size = { name: 'Size', options: ['M', 'L', 'XL'] };
const all = (a: number, b: number) =>
  Array.from({ length: a * b }, (_, k) => ({
    tierIndex: [Math.floor(k / b), k % b],
  }));

describe('validateVariations', () => {
  it('accepts an item without variations as a single model', () => {
    expect(() => validateVariations([], [{ tierIndex: [] }])).not.toThrow();
  });

  it('accepts one model per combination of two tiers', () => {
    expect(() => validateVariations([color, size], all(2, 3))).not.toThrow();
  });

  it.each([
    [
      'too many tiers',
      [color, size, { name: 'Chất liệu', options: ['Gỗ'] }],
      [],
    ],
    ['duplicate tier names', [color, { ...size, name: 'màu' }], all(2, 3)],
    [
      'duplicate options',
      [{ name: 'Màu', options: ['Đỏ', 'đỏ'] }],
      [{ tierIndex: [0] }, { tierIndex: [1] }],
    ],
    ['missing combinations', [color, size], all(2, 3).slice(1)],
    ['no model without variations', [], []],
    ['index out of range', [color], [{ tierIndex: [0] }, { tierIndex: [2] }]],
    [
      'wrong index length',
      [color],
      [{ tierIndex: [0, 0] }, { tierIndex: [1] }],
    ],
    [
      'duplicate combination',
      [color],
      [{ tierIndex: [0] }, { tierIndex: [0] }],
    ],
  ])('rejects %s', (_label, tiers, models) => {
    expect(() => validateVariations(tiers, models)).toThrow();
  });
});
