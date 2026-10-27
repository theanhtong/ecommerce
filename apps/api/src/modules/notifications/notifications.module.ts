import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { OutboxService } from './outbox.service.js';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, OutboxService],
  exports: [NotificationsService, OutboxService],
})
export class NotificationsModule {}
