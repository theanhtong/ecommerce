import { IsIn, IsInt, Max, Min, NotEquals } from 'class-validator';

export class StockAdjustmentDto {
  // Signed change to on-hand stock, e.g. +20 after a delivery or -2 for damaged goods.
  @IsInt()
  @NotEquals(0)
  @Min(-1_000_000)
  @Max(1_000_000)
  delta: number;

  @IsIn(['restock', 'adjust'])
  reason: 'restock' | 'adjust';
}
