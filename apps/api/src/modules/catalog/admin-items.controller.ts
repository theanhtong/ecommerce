import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@ecommerce/db';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AdminItemStatusDto } from './dto/item.dto.js';
import { ItemsService } from './items.service.js';

@Controller('admin/items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminItemsController {
  constructor(private readonly items: ItemsService) {}

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminItemStatusDto,
  ) {
    return this.items.adminSetStatus(id, dto.status);
  }
}
