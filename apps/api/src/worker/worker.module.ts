import { Module } from '@nestjs/common';
import { OrdersModule } from '../modules/orders/orders.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { OrderDeadlinesWorker } from './order-deadlines.worker.js';

@Module({
  imports: [PrismaModule, OrdersModule],
  providers: [OrderDeadlinesWorker],
})
export class WorkerModule {}
