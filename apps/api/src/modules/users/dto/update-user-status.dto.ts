import { UserStatus } from '@ecommerce/db';
import { IsEnum } from 'class-validator';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}
