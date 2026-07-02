import { BrandsService } from './brands.service.js';
import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuditAction, Role } from '../generated/prisma/enums.js';
import { Auditable } from '../audit-log/decorators/auditable.decorator.js';
import { AuditLogInterceptor } from '../audit-log/interceptors/audit-log.interceptor.js';
import { ApiBearerAuth } from '@nestjs/swagger';

const entityType = 'BRAND' as string;

@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
@Controller('admin/brands')
export class BrandsAdminController {
  constructor(private readonly brandsService: BrandsService) {}

  @Post()
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType, action: AuditAction.CREATE })
  create(@Body() dto: CreateBrandDto) {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType, action: AuditAction.UPDATE })
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType, action: AuditAction.DELETE })
  remove(@Param('id') id: string) {
    return this.brandsService.remove(id);
  }
}
