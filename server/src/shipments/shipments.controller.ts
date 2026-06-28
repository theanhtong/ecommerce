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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Role } from '../generated/prisma/enums.js';

@UseGuards(JwtAuthGuard)
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('orders/:orderId')
  getShipment(
    @CurrentUser() user: { id: string },
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.shipmentsService.getShipment(user.id, orderId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/orders/:orderId')
  createShipment(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateShipmentDto,
  ) {
    return this.shipmentsService.createShipment(orderId, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/:id/tracking')
  addTracking(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTrackingDto,
  ) {
    return this.shipmentsService.addTracking(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/:id/sync')
  syncStatus(@Param('id', ParseUUIDPipe) id: string) {
    return this.shipmentsService.syncStatus(id);
  }
}
