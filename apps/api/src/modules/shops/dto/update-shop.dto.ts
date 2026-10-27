import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Omittable } from '../../../common/omittable.js';
import { trim } from '../../../common/transforms.js';
import { ShopName } from './shop-fields.js';

export class UpdateShopDto {
  @Omittable()
  @ShopName()
  name?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
