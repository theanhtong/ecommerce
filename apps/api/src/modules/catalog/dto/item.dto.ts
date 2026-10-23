import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';
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
}

export class UpdateItemDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(3000)
  description?: string | null;
}

export class SellerItemStatusDto {
  @IsIn(['active', 'hidden'])
  status: 'active' | 'hidden';
}

export class AdminItemStatusDto {
  @IsIn(['active', 'banned'])
  status: 'active' | 'banned';
}
