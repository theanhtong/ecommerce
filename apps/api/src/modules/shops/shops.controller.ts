import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { ShopAddressDto } from './dto/shop-address.dto.js';
import { UpdateShopDto } from './dto/update-shop.dto.js';
import { ShopsService } from './shops.service.js';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Post()
  @MemberOnly()
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateShopDto) {
    return this.shops.create(user.sub, dto);
  }

  @Get('me')
  @MemberOnly()
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.shops.getMine(user.sub);
  }

  @Patch('me')
  @MemberOnly()
  updateMine(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateShopDto,
  ) {
    return this.shops.updateMine(user.sub, dto);
  }

  @Put('me/address')
  @MemberOnly()
  setAddress(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: ShopAddressDto,
  ) {
    return this.shops.setAddress(user.sub, dto);
  }

  // Declared after 'me' so it does not capture that route.
  @Get(':id')
  byId(@Param('id', ParseUUIDPipe) id: string) {
    return this.shops.getPublic(id);
  }
}
