import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { UpdateOrderStatusDto } from './dto/update-order.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  createOrder(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(user.id, dto);
  }

  @Get('my')
  getMyOrders(
    @CurrentUser() user: { id: string },
    @Query() query: PaginationDto,
  ) {
    return this.ordersService.getMyOrders(user.id, query);
  }

  @Get('my/:id')
  getMyOrder(
    @CurrentUser() user: { id: string },
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
  ) {
    return this.ordersService.getMyOrder(user.id, id);
  }

  @Patch('my/:id/cancel')
  cancelOrder(
    @CurrentUser() user: { id: string },
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
  ) {
    return this.ordersService.cancelOrder(user.id, id);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin')
  findAll(@Query() query: PaginationDto) {
    return this.ordersService.findAll(query);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/:id/status')
  updateStatus(
    @Param('id', new ParseUUIDPipe({ version: undefined })) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.updateStatus(id, dto);
  }
}
