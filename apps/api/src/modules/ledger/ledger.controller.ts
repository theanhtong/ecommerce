import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@ecommerce/db';
import { IsIn } from 'class-validator';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { LedgerService, REPORT_RANGES } from './ledger.service.js';
import type { ReportRange } from './ledger.service.js';

class ReportQuery {
  @IsIn(REPORT_RANGES)
  range: ReportRange;
}

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
    return this.ledger.shopReport(user.sub, query.range);
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
    return this.ledger.report(query.range);
  }
}
