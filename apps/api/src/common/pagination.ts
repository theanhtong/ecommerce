import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CursorQuery {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

// Ids are uuid v7, so ordering by id is ordering by creation time.
export const cursorArgs = ({ cursor, limit }: CursorQuery) => ({
  orderBy: { id: 'asc' as const },
  take: limit + 1,
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
});

export function toPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items.at(-1)!.id : null };
}
