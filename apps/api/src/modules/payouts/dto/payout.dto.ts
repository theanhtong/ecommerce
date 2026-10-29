import { PayoutStatus } from '@marketplace/db';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { CursorQuery } from '../../../common/pagination.js';
import { Text } from '../../regions/location.js';

export class CreatePayoutDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount: number;

  @Text(100)
  bankName: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @Matches(/^\d{6,20}$/, { message: 'accountNumber must be 6 to 20 digits' })
  accountNumber: string;

  @Text(100)
  accountName: string;
}

export class ListPayoutsQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;
}
