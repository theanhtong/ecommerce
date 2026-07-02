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
import { PromotionsService } from './promotions.service.js';
import { CreatePromotionDto } from './dto/create-promotion.dto.js';
import { UpdatePromotionDto } from './dto/update-promotion.dto.js';
import { AddPromotionProductDto } from './dto/add-promotion-product.dto.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuditAction, Role } from '../generated/prisma/enums.js';
import { AuditLogInterceptor } from '../audit-log/interceptors/audit-log.interceptor.js';
import { Auditable } from '../audit-log/decorators/auditable.decorator.js';
import { CreateCouponDto } from '../coupons/dto/create-coupon.dto.js';
import { CouponsService } from '../coupons/coupons.service.js';
import { ApiBearerAuth } from '@nestjs/swagger';

@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/promotions')
export class PromotionsAdminController {
  constructor(
    private readonly promotionsService: PromotionsService,
    private readonly couponsService: CouponsService,
  ) {}

  @Post()
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PROMOTION', action: AuditAction.CREATE })
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.promotionsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.findOne(id);
  }

  @Post(':id/coupons')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PROMOTION_COUPON', action: AuditAction.CREATE })
  createCoupon(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCouponDto,
  ) {
    return this.couponsService.create({ ...dto, promotionId: id });
  }

  @Patch(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PROMOTION', action: AuditAction.UPDATE })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PROMOTION', action: AuditAction.DELETE })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.promotionsService.remove(id);
  }

  @Post(':id/products')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PROMOTION_PRODUCT', action: AuditAction.CREATE })
  addProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPromotionProductDto,
  ) {
    return this.promotionsService.addProduct(id, dto);
  }

  @Delete(':id/products/:productId')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PROMOTION_PRODUCT', action: AuditAction.DELETE })
  removeProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('productId', ParseUUIDPipe) productId: string,
  ) {
    return this.promotionsService.removeProduct(id, productId);
  }
}
