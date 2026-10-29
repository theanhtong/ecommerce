import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@marketplace/db';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AdminListOrdersQuery } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: AdminListOrdersQuery) {
    return this.orders.listForAdmin(query);
  }
}
