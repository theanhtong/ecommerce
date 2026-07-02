import {
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { CreateVariantDto } from '../variants/dto/create-variant.dto.js';
import { UpdateVariantDto } from '../variants/dto/update-variant.dto.js';
import { UpdateInventoryDto } from '../inventories/dto/update-inventory.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { AuditAction, Role } from '../generated/prisma/enums.js';
import { AuditLogInterceptor } from '../audit-log/interceptors/audit-log.interceptor.js';
import { Auditable } from '../audit-log/decorators/auditable.decorator.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.STAFF)
@Controller('admin/products')
export class ProductsAdminController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT', action: AuditAction.CREATE })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Patch(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT', action: AuditAction.UPDATE })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT', action: AuditAction.DELETE })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/variants')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT_VARIANT', action: AuditAction.CREATE })
  createVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.createVariant(id, dto);
  }

  @Patch(':id/variants/:vid')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT_VARIANT', action: AuditAction.UPDATE })
  updateVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(id, vid, dto);
  }

  @Delete(':id/variants/:vid')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT_VARIANT', action: AuditAction.DELETE })
  removeVariant(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
  ) {
    return this.productsService.removeVariant(id, vid);
  }

  @Post(':id/variants/:vid/images')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        altText: { type: 'string' },
        order: { type: 'number' },
      },
    },
  })
  createImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('altText') altText?: string,
    @Query('order') order?: number,
  ) {
    return this.productsService.createImage(id, vid, file, altText, order);
  }

  @Delete(':id/variants/:vid/images/:iid')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'PRODUCT_IMAGE', action: AuditAction.DELETE })
  removeImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @Param('iid', ParseUUIDPipe) iid: string,
  ) {
    return this.productsService.removeImage(id, vid, iid);
  }

  @Patch(':id/variants/:vid/inventory')
  @UseInterceptors(AuditLogInterceptor)
  @Auditable({ entityType: 'INVENTORY', action: AuditAction.UPDATE })
  updateInventory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('vid', ParseUUIDPipe) vid: string,
    @Body() dto: UpdateInventoryDto,
  ) {
    return this.productsService.updateInventory(id, vid, dto);
  }
}
