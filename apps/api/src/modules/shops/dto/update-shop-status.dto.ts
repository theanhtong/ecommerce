import { ShopStatus } from '@ecommerce/db';
import { IsEnum } from 'class-validator';

export class UpdateShopStatusDto {
  @IsEnum(ShopStatus)
  status: ShopStatus;
}
