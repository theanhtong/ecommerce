import { IsEnum, IsOptional, IsString } from 'class-validator';

import { ShipmentStatus } from '../../generated/prisma/enums.js';

export class AddTrackingDto {
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
