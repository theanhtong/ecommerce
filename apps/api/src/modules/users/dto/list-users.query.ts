import { Role, UserStatus } from '@ecommerce/db';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { CursorQuery } from '../../../common/pagination.js';

export class ListUsersQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsIn(['with', 'without'])
  shop?: 'with' | 'without';
}
