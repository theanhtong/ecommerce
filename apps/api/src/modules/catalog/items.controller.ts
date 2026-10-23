import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  CreateItemDto,
  SellerItemStatusDto,
  UpdateItemDto,
} from './dto/item.dto.js';
import { VariationsDto } from './dto/variations.dto.js';
import { ItemsService } from './items.service.js';

@Controller()
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Post('items')
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateItemDto) {
    return this.items.create(user.sub, dto);
  }

  // Declared before 'items/:id' so it does not capture that route.
  @Get('items/mine')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AccessTokenPayload, @Query() query: CursorQuery) {
    return this.items.listMine(user.sub, query);
  }

  @Get('items/mine/:id')
  @UseGuards(JwtAuthGuard)
  mineById(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.items.getMine(user.sub, id);
  }

  @Get('items')
  list(@Query() query: CursorQuery) {
    return this.items.listPublic(query);
  }

  @Get('items/:id')
  byId(@Param('id', ParseUUIDPipe) id: string) {
    return this.items.getPublic(id);
  }

  @Patch('items/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(user.sub, id, dto);
  }

  @Patch('items/:id/status')
  @UseGuards(JwtAuthGuard)
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerItemStatusDto,
  ) {
    return this.items.setStatus(user.sub, id, dto.status);
  }

  @Put('items/:id/variations')
  @UseGuards(JwtAuthGuard)
  replaceVariations(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VariationsDto,
  ) {
    return this.items.replaceVariations(user.sub, id, dto);
  }

  @Get('shops/:id/items')
  byShop(@Param('id', ParseUUIDPipe) id: string, @Query() query: CursorQuery) {
    return this.items.listByShop(id, query);
  }
}
