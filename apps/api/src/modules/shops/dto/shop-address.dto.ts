import { Text, VietnamesePhone, WardCode } from '../../regions/location.js';

export class ShopAddressDto {
  @Text(100)
  contactName: string;

  @VietnamesePhone()
  phone: string;

  @WardCode()
  wardCode: string;

  @Text(200)
  street: string;
}
