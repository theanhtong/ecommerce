import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsInt,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Text } from '../../regions/location.js';

class FlashSaleModelDto {
  @IsUUID()
  modelId: string;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  price: number;

  @IsInt()
  @Min(1)
  @Max(100_000)
  quota: number;

  @IsInt()
  @Min(1)
  @Max(100)
  purchaseLimit: number;
}

export class CreateFlashSaleDto {
  @Text(100)
  name: string;

  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  endsAt: Date;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => FlashSaleModelDto)
  models: FlashSaleModelDto[];
}
