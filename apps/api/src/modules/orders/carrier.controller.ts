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
import { CarrierKeyGuard } from './carrier-key.guard.js';
import { ShipmentStatusDto } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('carrier/shipments')
@UseGuards(CarrierKeyGuard)
@SkipThrottle()
export class CarrierController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShipmentStatusDto,
  ) {
    return this.orders.carrierUpdate(id, dto.status);
  }
}
