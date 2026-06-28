import { CreateShipmentDto } from './create-shipment.dto.js';
import { PartialType } from '@nestjs/swagger';

export class UpdateShipmentDto extends PartialType(CreateShipmentDto) {}
