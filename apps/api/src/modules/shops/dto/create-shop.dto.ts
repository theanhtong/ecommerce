import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { trim } from '../../../common/transforms.js';
import { ShopAddressDto } from './shop-address.dto.js';
import { ShopName } from './shop-fields.js';

export class CreateShopDto extends ShopAddressDto {
  @ShopName()
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
