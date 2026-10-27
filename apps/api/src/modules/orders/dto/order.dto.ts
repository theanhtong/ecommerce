import { CancelReason, OrderStatus, PaymentMethod } from '@ecommerce/db';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CursorQuery } from '../../../common/pagination.js';
import { trim } from '../../../common/transforms.js';

export class PreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  cartItemIds: string[];

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
}

export class ListOrdersQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
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

export class ShipmentStatusDto {
  @IsIn(['picked_up', 'delivered'])
  status: 'picked_up' | 'delivered';
}
