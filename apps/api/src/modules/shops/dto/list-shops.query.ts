import { ShopStatus } from '@ecommerce/db';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { CursorQuery } from '../../../common/pagination.js';

export class ListShopsQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(ShopStatus)
  status?: ShopStatus;

  // Only shops waiting for a decision on joining Freeship.
  @IsOptional()
  @IsIn(['requested'])
  freeship?: 'requested';
}
