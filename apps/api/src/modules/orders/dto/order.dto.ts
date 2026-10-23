import { CancelReason, OrderStatus, PaymentMethod } from '@ecommerce/db';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { CursorQuery } from '../../../common/pagination.js';
import { trim } from '../../../common/transforms.js';

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  cartItemIds: string[];

  @IsUUID()
  addressId: string;

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;
}

export class ListOrdersQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
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
