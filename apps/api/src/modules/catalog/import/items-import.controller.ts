import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { AccessTokenPayload } from '../../auth/auth.service.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../../auth/decorators/member-only.decorator.js';
import { ItemsImportService } from './items-import.service.js';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

@Controller('items/imports')
@MemberOnly()
export class ItemsImportController {
  constructor(private readonly imports: ItemsImportService) {}

  @Get('template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="items-template.csv"')
  template() {
    return this.imports.template();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="items.csv"')
  export(@CurrentUser() user: AccessTokenPayload) {
    return this.imports.export(user.sub);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } }),
  )
  upload(
    @CurrentUser() user: AccessTokenPayload,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
  ) {
    if (!file)
      throw new BadRequestException('Attach a CSV file in the "file" field');
    if (!file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only .csv files are supported');
    }
    return this.imports.import(user.sub, file.buffer.toString('utf8'));
  }
}
