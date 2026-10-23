import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CreateShopDto } from './dto/create-shop.dto.js';
import { UpdateShopDto } from './dto/update-shop.dto.js';
import { ShopsService } from './shops.service.js';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateShopDto) {
    return this.shops.create(user.sub, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser() user: AccessTokenPayload) {
    return this.shops.getMine(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMine(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateShopDto,
  ) {
    return this.shops.updateMine(user.sub, dto);
  }

  // Declared after 'me' so it does not capture that route.
  @Get(':id')
  byId(@Param('id', ParseUUIDPipe) id: string) {
    return this.shops.getPublic(id);
  }
}
