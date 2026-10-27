import { DiscountKind } from '@ecommerce/db';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { Text } from '../../regions/location.js';

export class CreateVoucherDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9]{4,20}$/, {
    message: 'code must be 4 to 20 letters or digits',
  })
  code: string;

  @Text(100)
  name: string;

  @IsEnum(DiscountKind)
  discountKind: DiscountKind;

  @IsInt()
  @Min(1)
  @Max(100_000_000)
  discountValue: number;

  @ValidateIf((o: CreateVoucherDto) => o.discountKind === 'percent')
  @IsOptional()
  @IsInt()
  @Min(1)
  maxDiscount?: number;

  @IsInt()
  @Min(0)
  minSpend: number;

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  usageLimit: number;

  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  endsAt: Date;
}

export class CreatePlatformVoucherDto extends CreateVoucherDto {
  @IsIn(['platform_voucher', 'shipping_voucher'])
  type: 'platform_voucher' | 'shipping_voucher';
}
