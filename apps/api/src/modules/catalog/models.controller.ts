import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { StockAdjustmentDto } from './dto/stock-adjustment.dto.js';
import { ModelFieldsDto } from './dto/variations.dto.js';
import { ItemsService } from './items.service.js';

@Controller('models')
@UseGuards(JwtAuthGuard)
export class ModelsController {
  constructor(private readonly items: ItemsService) {}

  @Patch(':id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ModelFieldsDto,
  ) {
    return this.items.updateModel(user.sub, id, dto);
  }

  @Post(':id/stock-adjustments')
  adjustStock(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StockAdjustmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.items.adjustStock(
      user.sub,
      id,
      dto,
      idempotencyKey?.slice(0, 100),
    );
  }

  @Get(':id/stock-movements')
  movements(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: CursorQuery,
  ) {
    return this.items.listMovements(user.sub, id, query);
  }
}
