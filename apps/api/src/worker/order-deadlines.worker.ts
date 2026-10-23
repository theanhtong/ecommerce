import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { OrdersService } from '../modules/orders/orders.service.js';

const QUEUE = 'order-deadlines';

function redisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL is required');
  return url;
}

// The scheduler lives in Redis, so however many workers run, each minute is swept once.
@Injectable()
export class OrderDeadlinesWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OrderDeadlinesWorker.name);
  private readonly connection = new Redis(redisUrl(), {
    maxRetriesPerRequest: null,
  });
  private readonly queue = new Queue(QUEUE, { connection: this.connection });
  private worker?: Worker;

  constructor(private readonly orders: OrdersService) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(
      'sweep',
      { every: 60_000 },
      { opts: { removeOnComplete: true, removeOnFail: 100 } },
    );
    this.worker = new Worker(QUEUE, () => this.sweep(), {
      connection: this.connection,
    });
    this.worker.on('failed', (_job, error) =>
      this.logger.error(`Sweep failed: ${error.message}`, error.stack),
    );
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit();
  }

  private async sweep() {
    const cancelled = await this.orders.cancelUnshipped();
    const completed = await this.orders.completeDelivered();
    if (cancelled || completed) {
      this.logger.log(`Cancelled ${cancelled}, completed ${completed} orders`);
    }
  }
}
