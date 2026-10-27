import { Body, Controller, Post } from '@nestjs/common';
import { IsIn } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, type ImageType } from './images.js';
import { StorageService, TMP_PREFIX } from './storage.service.js';

class ImageUploadDto {
  @IsIn(Object.keys(IMAGE_TYPES))
  contentType: ImageType;
}

@Controller('uploads')
@MemberOnly()
export class UploadsController {
  constructor(private readonly storage: StorageService) {}

  // The browser posts the file straight to storage; the key is then handed to whatever claims it.
  @Post('images')
  async image(
    @CurrentUser() user: AccessTokenPayload,
    @Body() { contentType }: ImageUploadDto,
  ) {
    const key = `${TMP_PREFIX}${user.sub}/${randomUUID()}.${IMAGE_TYPES[contentType].ext}`;
    const { url, fields } = await this.storage.presignUpload(
      key,
      contentType,
      MAX_IMAGE_BYTES,
    );
    return { key, url, fields, maxBytes: MAX_IMAGE_BYTES };
  }
}
