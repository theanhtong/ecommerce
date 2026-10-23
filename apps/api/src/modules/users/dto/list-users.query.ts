import { UserStatus } from '@ecommerce/db';
import { IsEnum, IsOptional } from 'class-validator';
import { CursorQuery } from '../../../common/pagination.js';

export class ListUsersQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
