import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
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
  @MemberOnly()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateItemDto) {
    return this.items.create(user.sub, dto);
  }

  // Declared before 'items/:id' so it does not capture that route.
  @Get('items/mine')
  @MemberOnly()
  mine(@CurrentUser() user: AccessTokenPayload, @Query() query: CursorQuery) {
    return this.items.listMine(user.sub, query);
  }

  @Get('items/mine/:id')
  @MemberOnly()
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
  @MemberOnly()
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(user.sub, id, dto);
  }

  @Delete('items/:id')
  @MemberOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.items.remove(user.sub, id);
  }

  @Patch('items/:id/status')
  @MemberOnly()
  setStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerItemStatusDto,
  ) {
    return this.items.setStatus(user.sub, id, dto.status);
  }

  @Put('items/:id/variations')
  @MemberOnly()
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
