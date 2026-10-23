import { ItemStatus } from '@ecommerce/db';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Omittable } from '../../../common/omittable.js';
import { CursorQuery } from '../../../common/pagination.js';
import { trim } from '../../../common/transforms.js';
import { VariationsDto } from './variations.dto.js';

export class CreateItemDto extends VariationsDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  parentSku?: string;

  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  description?: string | null;

  // Grams after packing.
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  weight: number;
}

export class UpdateItemDto {
  @Omittable()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  description?: string | null;

  @Omittable()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  weight?: number;
}

export class SellerItemStatusDto {
  @IsIn(['active', 'hidden'])
  status: 'active' | 'hidden';
}

export class AdminItemStatusDto {
  @IsIn(['active', 'banned'])
  status: 'active' | 'banned';
}

export class AdminListItemsQuery extends CursorQuery {
  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsEnum(ItemStatus)
  status?: ItemStatus;
}
