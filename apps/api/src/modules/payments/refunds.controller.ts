import {
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
import { RefundStatus, Role } from '@ecommerce/db';
import { IsEnum, IsOptional } from 'class-validator';
import { CursorQuery } from '../../common/pagination.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RefundsService } from './refunds.service.js';

class ListRefundsQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(RefundStatus)
  status?: RefundStatus;
}

@Controller('admin/refunds')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Get()
  list(@Query() query: ListRefundsQuery) {
    return this.refunds.list(query);
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  pay(@Param('id', ParseUUIDPipe) id: string) {
    return this.refunds.pay(id);
  }
}
