import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@ecommerce/db';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import {
  CreatePlatformVoucherDto,
  CreateVoucherDto,
} from './dto/voucher.dto.js';
import { VouchersService } from './vouchers.service.js';

class AvailableQuery {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  shopIds: string[] = [];
}

@Controller()
@MemberOnly()
export class VouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Get('vouchers')
  available(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: AvailableQuery,
  ) {
    return this.vouchers.available(user.sub, query.shopIds);
  }

  @Post('shops/me/vouchers')
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: CreateVoucherDto,
  ) {
    return this.vouchers.createForShop(user.sub, dto);
  }

  @Get('shops/me/vouchers')
  list(@CurrentUser() user: AccessTokenPayload) {
    return this.vouchers.listForShop(user.sub);
  }

  @Post('shops/me/vouchers/:id/end')
  @HttpCode(HttpStatus.OK)
  end(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.vouchers.endForShop(user.sub, id);
  }
}

@Controller('admin/vouchers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminVouchersController {
  constructor(private readonly vouchers: VouchersService) {}

  @Post()
  create(@Body() dto: CreatePlatformVoucherDto) {
    return this.vouchers.createForPlatform(dto);
  }

  @Get()
  list() {
    return this.vouchers.listForPlatform();
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  end(@Param('id', ParseUUIDPipe) id: string) {
    return this.vouchers.endForPlatform(id);
  }
}
