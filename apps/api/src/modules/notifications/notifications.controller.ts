import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CursorQuery } from '../../common/pagination.js';
import type { AccessTokenPayload } from '../auth/auth.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { MemberOnly } from '../auth/decorators/member-only.decorator.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@MemberOnly()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AccessTokenPayload, @Query() query: CursorQuery) {
    return this.notifications.list(user.sub, query);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  readAll(@CurrentUser() user: AccessTokenPayload) {
    return this.notifications.markRead(user.sub);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  read(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notifications.markRead(user.sub, id);
  }
}
