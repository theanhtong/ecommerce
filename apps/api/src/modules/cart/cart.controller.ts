import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { CartService } from './cart.service.js';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart-item.dto.js';

@Controller('cart')
@MemberOnly()
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AccessTokenPayload) {
    return this.cart.get(user.sub);
  }

  @Post('items')
  add(@CurrentUser() user: AccessTokenPayload, @Body() dto: AddCartItemDto) {
    return this.cart.add(user.sub, dto);
  }

  @Patch('items/:id')
  update(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.update(user.sub, id, dto.quantity);
  }

  @Delete('items/:id')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cart.remove(user.sub, id);
  }
}
