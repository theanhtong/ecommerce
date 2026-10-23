export const COLUMNS = [
  'parent_sku',
  'name',
  'description',
  'tier1_name',
  'tier1_option',
  'tier2_name',
  'tier2_option',
  'price',
  'stock',
  'sku',
] as const;

type Column = (typeof COLUMNS)[number];

// Header labels shown to sellers in the CSV; matched case-insensitively.
export const LABELS: { [K in Column]: string } = {
  parent_sku: 'Mã sản phẩm',
  name: 'Tên sản phẩm',
  description: 'Mô tả',
  tier1_name: 'Tên phân loại 1',
  tier1_option: 'Phân loại 1',
  tier2_name: 'Tên phân loại 2',
  tier2_option: 'Phân loại 2',
  price: 'Giá',
  stock: 'Tồn kho',
  sku: 'SKU phân loại',
};

const normalize = (header: string) =>
  header.normalize('NFC').trim().toLowerCase();
const label = (column: Column) => `"${LABELS[column]}"`;
type Record = { [K in Column]: string } & { row: number };

export interface ImportItem {
  parentSku: string;
  name: string;
  description?: string;
  tierVariations: { name: string; options: string[] }[];
  models: { tierIndex: number[]; price: number; stock: number; sku?: string }[];
}

export interface ImportGroup {
  parentSku: string;
  rows: number[];
  item?: ImportItem;
  error?: string;
}

export class ImportFormatError extends Error {}

const toInt = (value: string, column: Column, row: number) => {
  if (!/^-?\d+$/.test(value)) {
    throw new ImportFormatError(
      `Row ${row}: ${label(column)} must be a whole number`,
    );
  }
  return Number(value);
};

// Rows sharing a product code form one item; tier options are taken in order of first appearance.
function buildItem(parentSku: string, records: Record[]): ImportItem {
  const [first] = records;
  for (const r of records) {
    for (const column of ['name', 'tier1_name', 'tier2_name'] as const) {
      if (r[column] !== first[column]) {
        throw new ImportFormatError(
          `Row ${r.row}: ${label(column)} differs from row ${first.row} of the same ${label('parent_sku')}`,
        );
      }
    }
  }
  const tierNames = [first.tier1_name, first.tier2_name].filter(Boolean);
  if (!first.tier1_name && first.tier2_name) {
    throw new ImportFormatError(
      `Row ${first.row}: ${label('tier2_name')} needs ${label('tier1_name')}`,
    );
  }

  const options = tierNames.map(() => [] as string[]);
  const models = records.map((r) => {
    const picked = [r.tier1_option, r.tier2_option].slice(0, tierNames.length);
    const tierIndex = picked.map((option, t) => {
      if (!option) {
        throw new ImportFormatError(
          `Row ${r.row}: ${label(t === 0 ? 'tier1_option' : 'tier2_option')} is required`,
        );
      }
      if (!options[t].includes(option)) options[t].push(option);
      return options[t].indexOf(option);
    });
    return {
      tierIndex,
      price: toInt(r.price, 'price', r.row),
      stock: toInt(r.stock, 'stock', r.row),
      ...(r.sku && { sku: r.sku }),
    };
  });

  return {
    parentSku,
    name: first.name,
    ...(first.description && { description: first.description }),
    tierVariations: tierNames.map((name, t) => ({ name, options: options[t] })),
    models,
  };
}

// Throws ImportFormatError only for file-level problems; per-item problems land in group.error.
export function buildImportGroups(table: string[][]): ImportGroup[] {
  const header = table[0].map(normalize);
  const index = (c: Column) => header.indexOf(normalize(LABELS[c]));
  const missing = COLUMNS.filter((c) => index(c) === -1);
  if (missing.length) {
    throw new ImportFormatError(
      `Missing columns: ${missing.map(label).join(', ')}`,
    );
  }

  const byParent = new Map<string, Record[]>();
  const groups: ImportGroup[] = [];
  table.slice(1).forEach((cells, i) => {
    const record = { row: i + 2 } as Record;
    for (const c of COLUMNS) record[c] = (cells[index(c)] ?? '').trim();
    if (!record.parent_sku) {
      groups.push({
        parentSku: '',
        rows: [record.row],
        error: `Row ${record.row}: ${label('parent_sku')} is required`,
      });
      return;
    }
    byParent.set(record.parent_sku, [
      ...(byParent.get(record.parent_sku) ?? []),
      record,
    ]);
  });

  for (const [parentSku, records] of byParent) {
    const rows = records.map((r) => r.row);
    try {
      groups.push({ parentSku, rows, item: buildItem(parentSku, records) });
    } catch (error) {
      if (!(error instanceof ImportFormatError)) throw error;
      groups.push({ parentSku, rows, error: error.message });
    }
  }
  return groups.sort((a, b) => a.rows[0] - b.rows[0]);
}
