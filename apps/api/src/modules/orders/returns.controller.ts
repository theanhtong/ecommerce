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
import { ReturnReason, ReturnStatus, Role } from '@marketplace/db';
import { IsEnum, IsOptional } from 'class-validator';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Text } from '../regions/location.js';
import { ReturnsService } from './returns.service.js';

class RequestReturnDto {
  @IsEnum(ReturnReason)
  reason: ReturnReason;

  @IsOptional()
  @Text(500)
  note?: string;
}

class RejectReturnDto {
  @Text(500)
  note: string;
}

class ListReturnsQuery extends CursorQuery {
  @IsOptional()
  @IsEnum(ReturnStatus)
  status?: ReturnStatus;
}

@Controller('orders/:id/return')
@MemberOnly()
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  request(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestReturnDto,
  ) {
    return this.returns.request(user.sub, id, dto);
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.sellerAccept(user.sub, id);
  }

  @Post('reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectReturnDto,
  ) {
    return this.returns.sellerReject(user.sub, id, dto.note);
  }
}

@Controller('admin/returns')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class AdminReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  list(@Query() query: ListReturnsQuery) {
    return this.returns.list(query);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.adminAccept(id, user.sub);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.returns.adminReject(id, user.sub);
  }
}
