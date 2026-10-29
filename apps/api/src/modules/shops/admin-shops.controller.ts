import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@marketplace/db';
import { IsBoolean } from 'class-validator';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ListShopsQuery } from './dto/list-shops.query.js';
import { UpdateShopStatusDto } from './dto/update-shop-status.dto.js';
import { ShopsService } from './shops.service.js';

class FreeshipDecisionDto {
  @IsBoolean()
  approve: boolean;
}

@Controller('admin/shops')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  list(@Query() query: ListShopsQuery) {
    return this.shops.list(query);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.shops.getForAdmin(id);
  }

  @Patch(':id/freeship')
  decideFreeship(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: FreeshipDecisionDto,
  ) {
    return this.shops.decideFreeship(id, dto.approve);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() admin: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopStatusDto,
  ) {
    return this.shops.updateStatus(admin.sub, id, dto.status, dto.reason);
  }
}
