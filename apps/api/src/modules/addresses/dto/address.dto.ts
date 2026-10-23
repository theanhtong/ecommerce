import { IsBoolean, IsOptional } from 'class-validator';
import { Omittable } from '../../../common/omittable.js';
import { Text, VietnamesePhone, WardCode } from '../../regions/location.js';

export class CreateAddressDto {
  @Text(100)
  recipientName: string;

  @VietnamesePhone()
  phone: string;

  @WardCode()
  wardCode: string;

  @Text(200)
  street: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateAddressDto {
  @Omittable()
  @Text(100)
  recipientName?: string;

  @Omittable()
  @VietnamesePhone()
  phone?: string;

  @Omittable()
  @WardCode()
  wardCode?: string;

  @Omittable()
  @Text(200)
  street?: string;
}
