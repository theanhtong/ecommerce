import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { OrdersService } from '../modules/orders/orders.service.js';
import { ReturnsService } from '../modules/orders/returns.service.js';
import { redisConnection } from './redis.js';

const QUEUE = 'order-deadlines';

// The scheduler lives in Redis, so however many workers run, each minute is swept once.
@Injectable()
export class OrderDeadlinesWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OrderDeadlinesWorker.name);
  private readonly connection = redisConnection();
  private readonly queue = new Queue(QUEUE, { connection: this.connection });
  private worker?: Worker;

  constructor(
    private readonly orders: OrdersService,
    private readonly returns: ReturnsService,
  ) {}

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
    const cancelled =
      (await this.orders.expireUnpaid()) +
      (await this.orders.cancelUnshipped());
    const returned = await this.returns.acceptUnanswered();
    const completed = await this.orders.completeDelivered();
    if (cancelled || returned || completed) {
      this.logger.log(
        `Cancelled ${cancelled}, returned ${returned}, completed ${completed} orders`,
      );
    }
  }
}
