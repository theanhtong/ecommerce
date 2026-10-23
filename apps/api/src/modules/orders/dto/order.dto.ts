import { OrderStatus, PaymentMethod } from '@ecommerce/db';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { CursorQuery } from '../../../common/pagination.js';

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
