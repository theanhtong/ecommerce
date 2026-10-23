import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trim } from '../../../common/transforms.js';

const trimEach = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value.map((v) => (typeof v === 'string' ? v.trim() : v))
    : value;

export class ModelFieldsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  price?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  sku?: string | null;
}

export class TierVariationDto {
  @Transform(trim)
  @IsString()
  @Length(1, 20)
  name: string;

  @Transform(trimEach)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 30, { each: true })
  options: string[];
}

export class ModelDto {
  @IsArray()
  @ArrayMaxSize(2)
  @IsInt({ each: true })
  tierIndex: number[];

  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  price: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  sku?: string | null;
}

export class VariationsDto {
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => TierVariationDto)
  tierVariations: TierVariationDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => ModelDto)
  models: ModelDto[];
}
