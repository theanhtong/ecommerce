import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { IsIn } from 'class-validator';
import { CarrierKeyGuard } from './carrier-key.guard.js';
import { OrdersService } from './orders.service.js';

class CarrierStatusDto {
  @IsIn(['picked_up', 'delivered'])
  status: 'picked_up' | 'delivered';
}

// Endpoints for the separate carrier service, not for buyers or sellers.
@Controller('carrier/shipments')
@UseGuards(CarrierKeyGuard)
@SkipThrottle()
export class CarrierController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CarrierStatusDto,
  ) {
    return this.orders.carrierUpdate(id, dto.status);
  }
}
