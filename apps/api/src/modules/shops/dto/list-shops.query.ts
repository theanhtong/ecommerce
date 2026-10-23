import { ShopStatus } from '@ecommerce/db';
import { IsEnum, IsOptional } from 'class-validator';
import { CursorQuery } from '../../../common/pagination.js';

export class ListShopsQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(ShopStatus)
  status?: ShopStatus;
}
