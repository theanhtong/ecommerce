import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ShipmentsService } from './shipments.service.js';
import { CreateShipmentDto } from './dto/create-shipment.dto.js';
import { AddTrackingDto } from './dto/add-tracking.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/shipments')
export class ShipmentsAdminController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post('orders/:orderId')
  createShipment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipmentsService.createShipment(orderId, dto);
  }

  @Post(':id/tracking')
  addTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTrackingDto,
  ) {
    return this.shipmentsService.addTracking(id, dto);
  }

  @Get(':id/sync')
  syncStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipmentsService.syncStatus(id);
  }
}
