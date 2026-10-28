import { UserStatus } from '@ecommerce/db';
import { IsEnum, ValidateIf } from 'class-validator';
import { Text } from '../../regions/location.js';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  // Required to ban; the user sees it when they try to sign in.
  @ValidateIf((o: UpdateUserStatusDto) => o.status === UserStatus.banned)
  @Text(500)
  reason?: string;
}
