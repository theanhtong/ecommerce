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
import { Role } from '@ecommerce/db';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ListShopsQuery } from './dto/list-shops.query.js';
import { UpdateShopStatusDto } from './dto/update-shop-status.dto.js';
import { ShopsService } from './shops.service.js';

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

  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShopStatusDto,
  ) {
    return this.shops.updateStatus(id, dto.status);
  }
}
