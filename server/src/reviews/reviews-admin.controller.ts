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
import { ReviewsService } from './reviews.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { Role } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { CreateReplyDto } from './dto/create-reply.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/reviews')
export class ReviewsAdminController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.reviewsService.findAll(query);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.adminRemove(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post(':id/replies')
  createReply(
    @CurrentUser() user: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReplyDto,
  ) {
    return this.reviewsService.createReply(user.id, id, dto);
  }
}
