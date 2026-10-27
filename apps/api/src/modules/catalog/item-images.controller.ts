import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ArrayMaxSize, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { ItemImagesService, MAX_ITEM_IMAGES } from './item-images.service.js';

class AddImageDto {
  @IsString()
  @MaxLength(200)
  key: string;
}

class ReorderImagesDto {
  @IsUUID('all', { each: true })
  @ArrayMaxSize(MAX_ITEM_IMAGES)
  ids: string[];
}

@Controller('items/:id/images')
@MemberOnly()
export class ItemImagesController {
  constructor(private readonly images: ItemImagesService) {}

  @Post()
  add(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddImageDto,
  ) {
    return this.images.add(user.sub, id, dto.key);
  }

  @Put()
  reorder(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderImagesDto,
  ) {
    return this.images.reorder(user.sub, id, dto.ids);
  }

  @Delete(':imageId')
  remove(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ) {
    return this.images.remove(user.sub, id, imageId);
  }
}
