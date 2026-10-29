import { ShopStatus } from '@marketplace/db';
import { IsEnum, ValidateIf } from 'class-validator';
import { Text } from '../../regions/location.js';

export class UpdateShopStatusDto {
  @IsEnum(ShopStatus)
  status: ShopStatus;

  // Required to ban or reject; the owner sees it on their shop.
  @ValidateIf(
    (o: UpdateShopStatusDto) =>
      o.status === ShopStatus.banned || o.status === ShopStatus.rejected,
  )
  @Text(500)
  reason?: string;
}
