import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

import { NotificationType } from '../../generated/prisma/enums.js';

export class CreateNotificationDto {
  @IsString()
  userId!: string;

  @IsEnum(NotificationType)
  type!: NotificationType;

  @IsString()
  title!: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
