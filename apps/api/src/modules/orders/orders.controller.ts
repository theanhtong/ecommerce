import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CheckoutService } from './checkout.service.js';
import { CheckoutDto, ListOrdersQuery } from './dto/order.dto.js';
import { OrdersService } from './orders.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(
    private readonly checkouts: CheckoutService,
    private readonly orders: OrdersService,
  ) {}

  @Post('checkout')
  checkout(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.checkouts.checkout(user.sub, dto, key);
  }

  @Get('orders')
  mine(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListOrdersQuery,
  ) {
    return this.orders.listForBuyer(user.sub, query);
  }

  @Get('shops/me/orders')
  shopOrders(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListOrdersQuery,
  ) {
    return this.orders.listForShop(user.sub, query);
  }

  @Get('orders/:id')
  get(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.get(user.sub, id);
  }

  @Post('orders/:id/ship')
  @HttpCode(HttpStatus.OK)
  ship(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.ship(user.sub, id);
  }

  @Post('orders/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.cancel(user.sub, id);
  }

  @Post('orders/:id/receive')
  @HttpCode(HttpStatus.OK)
  receive(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.receive(user.sub, id);
  }
}
