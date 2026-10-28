import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@ecommerce/db';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CreatePayoutDto, ListPayoutsQuery } from './dto/payout.dto.js';
import { PayoutsService } from './payouts.service.js';

@Controller('shops/me/payouts')
@MemberOnly()
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Post()
  request(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreatePayoutDto,
  ) {
    return this.payouts.request(user.sub, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ListPayoutsQuery,
  ) {
    return this.payouts.listForShop(user.sub, query);
  }
}
