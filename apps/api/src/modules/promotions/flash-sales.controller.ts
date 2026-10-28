import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { CreateFlashSaleDto } from './dto/flash-sale.dto.js';
import { FlashSalesService } from './flash-sales.service.js';

@Controller()
export class FlashSalesController {
  constructor(private readonly flashSales: FlashSalesService) {}

  @Get('flash-sales')
  active() {
    return this.flashSales.listActive();
  }

  @Get('flash-sales/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.flashSales.getPublic(id);
  }

  @Get('flash-sales/:id/allowance')
  @MemberOnly()
  allowance(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.flashSales.allowance(user.sub, id);
  }

  @Post('shops/me/flash-sales')
  @MemberOnly()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateFlashSaleDto,
  ) {
    return this.flashSales.create(user.sub, dto);
  }

  @Get('shops/me/flash-sales')
  @MemberOnly()
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.flashSales.listForShop(user.sub);
  }

  @Post('shops/me/flash-sales/:id/end')
  @MemberOnly()
  @HttpCode(HttpStatus.OK)
  end(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.flashSales.end(user.sub, id);
  }
}
