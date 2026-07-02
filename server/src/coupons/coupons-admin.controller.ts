import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CouponsService } from './coupons.service.js';
import { CreateCouponDto } from './dto/create-coupon.dto.js';
import { UpdateCouponDto } from './dto/update-coupon.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AuditAction, Role } from '../generated/prisma/enums.js';
import { AuditLogInterceptor } from '../audit-log/interceptors/audit-log.interceptor.js';
import { Auditable } from '../audit-log/decorators/auditable.decorator.js';
import { ApiBearerAuth } from '@nestjs/swagger';

const entityType = 'COUPON' as string;

@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/coupons')
export class CouponsAdminController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post()
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType, action: AuditAction.CREATE })
  create(@Body() dto: CreateCouponDto) {
    return this.couponsService.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.couponsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponsService.findOne(id);
  }

  @Patch(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType, action: AuditAction.UPDATE })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto) {
    return this.couponsService.update(id, dto);
  }

  @Delete(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType, action: AuditAction.DELETE })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponsService.remove(id);
  }
}
