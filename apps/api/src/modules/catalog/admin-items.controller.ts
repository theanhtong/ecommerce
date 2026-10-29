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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AdminItemStatusDto, AdminListItemsQuery } from './dto/item.dto.js';
import { ItemsService } from './items.service.js';

@Controller('admin/items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query() query: AdminListItemsQuery) {
    return this.items.listForAdmin(query);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminItemStatusDto,
  ) {
    return this.items.adminSetStatus(id, dto.status);
  }
}
