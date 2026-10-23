import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CreateItemDto } from '../dto/item.dto.js';
import { ItemsService } from '../items.service.js';
import {
  buildImportGroups,
  COLUMNS,
  ImportFormatError,
  LABELS,
} from './build-items.js';
import { parseCsv, toCsv } from './csv.js';

export const MAX_IMPORT_ROWS = 1000;

export type ImportResult =
  | { parentSku: string; rows: number[]; status: 'created'; itemId: string }
  | { parentSku: string; rows: number[]; status: 'failed'; error: string };

type Column = (typeof COLUMNS)[number];

const ITEM_FIELDS: { [field: string]: Column } = {
  parentSku: 'parent_sku',
  name: 'name',
  description: 'description',
  price: 'price',
  stock: 'stock',
  sku: 'sku',
};

// Rewrites DTO errors in the seller's terms: column labels instead of field names, row numbers for models.
function messages(
  errors: ValidationError[],
  rows: number[],
  at: { model?: number; tier?: number } = {},
): string[] {
  return errors.flatMap((e) => {
    const column =
      at.tier !== undefined
        ? e.property === 'name'
          ? (`tier${at.tier + 1}_name` as Column)
          : (`tier${at.tier + 1}_option` as Column)
        : ITEM_FIELDS[e.property];
    const prefix = at.model !== undefined ? `Row ${rows[at.model]}: ` : '';
    const own = Object.values(e.constraints ?? {}).map(
      (m) =>
        prefix + (column ? m.replace(e.property, `"${LABELS[column]}"`) : m),
    );
    const children = (e.children ?? []).flatMap((child) => {
      const index = Number(child.property);
      if (e.property === 'models')
        return messages(child.children ?? [], rows, { model: index });
      if (e.property === 'tierVariations')
        return messages(child.children ?? [], rows, { tier: index });
      return messages([child], rows, at);
    });
    return [...own, ...children];
  });
}

const TEMPLATE_ROWS = [
  [
    'AO-001',
    'Áo thun cotton',
    'Cotton 100%',
    'Màu',
    'Trắng',
    'Size',
    'M',
    150000,
    10,
    'AO-TRANG-M',
  ],
  [
    'AO-001',
    'Áo thun cotton',
    'Cotton 100%',
    'Màu',
    'Trắng',
    'Size',
    'L',
    150000,
    8,
    'AO-TRANG-L',
  ],
  [
    'AO-001',
    'Áo thun cotton',
    'Cotton 100%',
    'Màu',
    'Đen',
    'Size',
    'M',
    165000,
    5,
    'AO-DEN-M',
  ],
  [
    'AO-001',
    'Áo thun cotton',
    'Cotton 100%',
    'Màu',
    'Đen',
    'Size',
    'L',
    165000,
    0,
    'AO-DEN-L',
  ],
  ['COC-001', 'Cốc gỗ khắc tên', '', '', '', '', '', 89000, 30, ''],
];

@Injectable()
export class ItemsImportService {
  constructor(private readonly items: ItemsService) {}

  // UTF-8 BOM so Excel opens the Vietnamese text correctly.
  template() {
    return '﻿' + toCsv([COLUMNS.map((c) => LABELS[c]), ...TEMPLATE_ROWS]);
  }

  // shortcut: runs inside the request, fine up to MAX_IMPORT_ROWS; move to a worker queue for larger files.
  async import(ownerId: string, csv: string) {
    await this.items.activeShopOf(ownerId);

    let table: string[][];
    try {
      table = parseCsv(csv);
    } catch (error) {
      throw new BadRequestException(
        `Malformed CSV: ${(error as Error).message}`,
      );
    }
    if (table.length < 2)
      throw new BadRequestException('The file has no product rows');
    if (table.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`At most ${MAX_IMPORT_ROWS} rows per file`);
    }
    let groups;
    try {
      groups = buildImportGroups(table);
    } catch (error) {
      if (error instanceof ImportFormatError)
        throw new BadRequestException(error.message);
      throw error;
    }

    const results: ImportResult[] = [];
    for (const { parentSku, rows, item, error } of groups) {
      const failed = (reason: string) =>
        results.push({ parentSku, rows, status: 'failed', error: reason });
      if (!item) {
        failed(error!);
        continue;
      }
      const dto = plainToInstance(CreateItemDto, item);
      const invalid = await validate(dto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      if (invalid.length) {
        failed(messages(invalid, rows).join('; '));
        continue;
      }
      try {
        const created = await this.items.create(ownerId, dto);
        results.push({
          parentSku,
          rows,
          status: 'created',
          itemId: created.id,
        });
      } catch (e) {
        if (!(e instanceof HttpException)) throw e;
        failed(e.message);
      }
    }

    return {
      created: results.filter((r) => r.status === 'created').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }
}
