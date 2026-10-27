import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { Text } from '../regions/location.js';
import { ReviewsService } from './reviews.service.js';

class ReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @Text(1000)
  comment?: string;
}

class ReplyDto {
  @Text(500)
  reply: string;
}

class ItemReviewsQuery extends CursorQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}

class ShopReviewsQuery extends CursorQuery {
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  replied?: boolean;
}

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('items/:id/reviews')
  listForItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ItemReviewsQuery,
  ) {
    return this.reviews.listForItem(id, query);
  }

  @Get('shops/me/reviews')
  @MemberOnly()
  listForShop(
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: ShopReviewsQuery,
  ) {
    return this.reviews.listForShop(user.sub, query);
  }

  @Post('order-items/:id/review')
  @MemberOnly()
  create(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.reviews.create(user.sub, id, dto);
  }

  @Patch('reviews/:id')
  @MemberOnly()
  edit(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
  ) {
    return this.reviews.edit(user.sub, id, dto);
  }

  @Post('reviews/:id/reply')
  @MemberOnly()
  reply(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
  ) {
    return this.reviews.reply(user.sub, id, dto.reply);
  }
}
