import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@ecommerce/db';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { LedgerService } from './ledger.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('shops/me/wallet')
  wallet(@CurrentUser() user: AccessTokenPayload, @Query() query: CursorQuery) {
    return this.ledger.wallet(user.sub, query);
  }

  @Get('admin/ledger/accounts')
  @UseGuards(RolesGuard)
  @Roles(Role.admin)
  balances() {
    return this.ledger.balances();
  }
}
