import { IsEnum, IsOptional, IsString } from 'class-validator';

import { PaymentMethod } from '../../generated/prisma/enums.js';

export class CreatePaymentDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  returnUrl?: string;
}
