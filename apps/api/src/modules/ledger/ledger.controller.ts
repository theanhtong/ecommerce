import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@ecommerce/db';
import { IntersectionType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import {
  ENTRY_TYPES,
  LedgerService,
  REPORT_PERIODS,
  SHOP_SORTS,
} from './ledger.service.js';
import type {
  EntryFilter,
  ReportPeriod,
  ReportWindow,
  ShopSort,
} from './ledger.service.js';

class ReportQuery implements ReportWindow {
  @IsIn(REPORT_PERIODS)
  period: ReportPeriod = 'month';

  @IsOptional()
  @Matches(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, {
    message: 'at must be YYYY, YYYY-MM or YYYY-MM-DD',
  })
  at?: string;
}

class ShopsReportQuery extends ReportQuery {
  @IsOptional()
  @MaxLength(100)
  q?: string;

  @IsIn(Object.keys(SHOP_SORTS))
  sort: ShopSort = 'itemsTotal';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}

class CodRemittanceDto {
  @IsInt()
  @Min(1)
  @Max(1_000_000_000)
  amount: number;
}

class EntryFilterQuery implements EntryFilter {
  @IsOptional()
  @IsIn(ENTRY_TYPES)
  type?: EntryFilter['type'];

  @IsOptional()
  @IsUUID()
  shopId?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}

class EntriesQuery extends IntersectionType(CursorQuery, EntryFilterQuery) {}

@Controller()
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('shops/me/wallet')
  @UseGuards(RolesGuard)
  @Roles(Role.user)
  wallet(@CurrentUser() user: AccessTokenPayload, @Query() query: CursorQuery) {
    return this.ledger.wallet(user.sub, query);
  }

  @Get('shops/me/report')
  @UseGuards(RolesGuard)
  @Roles(Role.user)
  shopReport(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ReportQuery,
  ) {
    return this.ledger.shopReport(user.sub, query);
  }

  @Get('admin/ledger/accounts')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  balances() {
    return this.ledger.balances();
  }

  @Get('admin/ledger/report')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  report(@Query() query: ReportQuery) {
    return this.ledger.report(query);
  }

  @Get('admin/ledger/shops')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  shopsReport(@Query() query: ShopsReportQuery) {
    return this.ledger.shopsReport(query);
  }

  @Get('admin/ledger/shops/:id/wallet')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  shopWallet(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorQuery,
  ) {
    return this.ledger.shopWallet(id, query);
  }

  @Post('admin/ledger/cod-remittances')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @HttpCode(HttpStatus.NO_CONTENT)
  remitCod(
    @Body() dto: CodRemittanceDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const key = idempotencyKey?.trim();
    if (!key || key.length > 100) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.ledger.remitCod(dto.amount, key);
  }

  @Get('admin/ledger/entries')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  entries(@Query() query: EntriesQuery) {
    return this.ledger.entries(query);
  }

  @Get('admin/ledger/entries.csv')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="ledger.csv"')
  entriesCsv(@Query() query: EntryFilterQuery) {
    return this.ledger.entriesCsv(query);
  }
}
