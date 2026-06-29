import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WishlistsService } from './wishlists.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AddWishlistDto } from './dto/add-wishlist.dto.js';
import { CheckWishlistDto } from './dto/check-wishlist.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('wishlists')
export class WishlistsController {
  constructor(private readonly wishlistsService: WishlistsService) {}

  @Get()
  findAll(@CurrentUser() user: { id: string }, @Query() query: PaginationDto) {
    return this.wishlistsService.findAll(user.id, query);
  }

  @Post('add')
  add(@CurrentUser() user: { id: string }, @Body() dto: AddWishlistDto) {
    return this.wishlistsService.add(user.id, dto);
  }

  @Delete(':wishlistId')
  remove(
    @CurrentUser() user: { id: string },
    @Param('wishlistId', ParseUUIDPipe) wishlistId: string,
  ) {
    return this.wishlistsService.remove(user.id, wishlistId);
  }

  @Post('check')
  check(@CurrentUser() user: { id: string }, @Body() dto: CheckWishlistDto) {
    return this.wishlistsService.check(user.id, dto);
  }
}
