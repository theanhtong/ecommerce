import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateOrderDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  cartItemIds!: string[];

  @IsUUID()
  addressId!: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
