import { CancelReason, OrderStatus, PaymentMethod } from '@marketplace/db';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { CursorQuery } from '../../../common/pagination.js';
import { trim } from '../../../common/transforms.js';

class FlashSaleLineDto {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}

// Either cart lines at regular prices, or one flash sale bought on its own ("buy now").
export class PreviewDto {
  @ValidateIf((o: PreviewDto) => !o.flashSale)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  cartItemIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FlashSaleLineDto)
  flashSale?: FlashSaleLineDto;

  @IsUUID()
  addressId: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20, { each: true })
  voucherCodes?: string[];
}

export class CheckoutDto extends PreviewDto {
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

  // The total the buyer saw; checkout is refused if prices moved since.
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedTotal?: number;
}

export class ListOrdersQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  // Whether the seller has prepared the parcel, which splits orders waiting for pickup.
  @IsOptional()
  @IsIn(['true', 'false'])
  prepared?: 'true' | 'false';
}

export class AdminListOrdersQuery extends ListOrdersQuery {
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @IsOptional()
  @IsUUID()
  shopId?: string;
}

export class CancelOrderDto {
  @IsOptional()
  @IsEnum(CancelReason)
  reason?: CancelReason;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}
