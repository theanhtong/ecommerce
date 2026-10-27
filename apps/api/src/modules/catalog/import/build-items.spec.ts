import { buildImportGroups, COLUMNS, LABELS } from './build-items.js';

const header = COLUMNS.map((c) => LABELS[c]);
const row = (values: Partial<Record<(typeof COLUMNS)[number], string>>) =>
  COLUMNS.map((c) => values[c] ?? (c === 'weight' ? '300' : ''));

describe('buildImportGroups', () => {
  it('groups rows by parent_sku and derives tiers and tierIndex', () => {
    const shirt = {
      parent_sku: 'AO',
      name: 'Áo',
      tier1_name: 'Màu',
      tier2_name: 'Size',
    };
    const [group] = buildImportGroups([
      header,
      row({
        ...shirt,
        tier1_option: 'Trắng',
        tier2_option: 'M',
        price: '150000',
        stock: '10',
        sku: 'A1',
      }),
      row({
        ...shirt,
        tier1_option: 'Trắng',
        tier2_option: 'L',
        price: '150000',
        stock: '8',
      }),
      row({
        ...shirt,
        tier1_option: 'Đen',
        tier2_option: 'M',
        price: '165000',
        stock: '5',
      }),
      row({
        ...shirt,
        tier1_option: 'Đen',
        tier2_option: 'L',
        price: '165000',
        stock: '0',
      }),
    ]);
    expect(group.rows).toEqual([2, 3, 4, 5]);
    expect(group.item).toEqual({
      parentSku: 'AO',
      name: 'Áo',
      weight: 300,
      tierVariations: [
        { name: 'Màu', options: ['Trắng', 'Đen'] },
        { name: 'Size', options: ['M', 'L'] },
      ],
      models: [
        { tierIndex: [0, 0], price: 150000, stock: 10, sku: 'A1' },
        { tierIndex: [0, 1], price: 150000, stock: 8 },
        { tierIndex: [1, 0], price: 165000, stock: 5 },
        { tierIndex: [1, 1], price: 165000, stock: 0 },
      ],
    });
  });

  it('builds a single-model item without tiers and keeps column order flexible', () => {
    const reordered = [...COLUMNS].reverse();
    const values = {
      parent_sku: 'COC',
      name: 'Cốc',
      description: 'Gỗ',
      weight: '250',
      price: '89000',
      stock: '30',
    };
    const [group] = buildImportGroups([
      reordered.map((c) => LABELS[c].toUpperCase()),
      reordered.map((c) => values[c as keyof typeof values] ?? ''),
    ]);
    expect(group.item).toEqual({
      parentSku: 'COC',
      name: 'Cốc',
      description: 'Gỗ',
      weight: 250,
      tierVariations: [],
      models: [{ tierIndex: [], price: 89000, stock: 30 }],
    });
  });

  it('reports per-item errors without failing other items', () => {
    const groups = buildImportGroups([
      header,
      row({ parent_sku: 'OK', name: 'Tốt', price: '1000', stock: '1' }),
      row({ parent_sku: 'BAD', name: 'Lỗi', price: '1.000', stock: '1' }),
      row({ name: 'Không mã', price: '1000', stock: '1' }),
      row({ parent_sku: 'MIX', name: 'A', price: '1000', stock: '1' }),
      row({ parent_sku: 'MIX', name: 'B', price: '1000', stock: '1' }),
      row({
        parent_sku: 'TIER',
        name: 'T',
        tier1_name: 'Màu',
        price: '1000',
        stock: '1',
      }),
    ]);
    expect(groups.map((g) => [g.parentSku, g.error ?? 'ok'])).toEqual([
      ['OK', 'ok'],
      ['BAD', 'Row 3: "Giá" must be a whole number'],
      ['', 'Row 4: "Mã sản phẩm" is required'],
      [
        'MIX',
        'Row 6: "Tên sản phẩm" differs from row 5 of the same "Mã sản phẩm"',
      ],
      ['TIER', 'Row 7: "Phân loại 1" is required'],
    ]);
  });

  it('rejects a file with missing columns', () => {
    expect(() => buildImportGroups([['Mã sản phẩm', 'parent_sku']])).toThrow(
      /Missing columns: "Tên sản phẩm", "Mô tả"/,
    );
  });

  it('requires one weight per product code', () => {
    const groups = buildImportGroups([
      header,
      row({ parent_sku: 'A', name: 'A', weight: '', price: '1', stock: '1' }),
      row({
        parent_sku: 'B',
        name: 'B',
        tier1_name: 'Màu',
        tier1_option: 'Đỏ',
        weight: '300',
        price: '1',
        stock: '1',
      }),
      row({
        parent_sku: 'B',
        name: 'B',
        tier1_name: 'Màu',
        tier1_option: 'Xanh',
        weight: '400',
        price: '1',
        stock: '1',
      }),
    ]);
    expect(groups.map((g) => g.error)).toEqual([
      'Row 2: "Cân nặng (g)" must be a whole number',
      'Row 4: "Cân nặng (g)" differs from row 3 of the same "Mã sản phẩm"',
    ]);
  });
});
