import { UserStatus } from '@ecommerce/db';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListUsersQuery {
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
