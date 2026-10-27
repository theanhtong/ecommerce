import { Module } from '@nestjs/common';
import { NotificationsModule } from '../modules/notifications/notifications.module.js';
import { OrdersModule } from '../modules/orders/orders.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrderDeadlinesWorker } from './order-deadlines.worker.js';
import { OutboxWorker } from './outbox.worker.js';

@Module({
  imports: [PrismaModule, OrdersModule, NotificationsModule],
  providers: [OrderDeadlinesWorker, OutboxWorker],
})
export class WorkerModule {}
