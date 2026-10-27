import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import {
  OutboxService,
  type PublishedEvent,
} from '../modules/notifications/outbox.service.js';
import { redisConnection } from './redis.js';

const RELAY_QUEUE = 'outbox-relay';
const EVENTS_QUEUE = 'events';
const BATCH = 100;

@Injectable()
export class OutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly connection = redisConnection();
  private readonly relayQueue = new Queue(RELAY_QUEUE, {
    connection: this.connection,
  });
  private readonly events = new Queue<PublishedEvent>(EVENTS_QUEUE, {
    connection: this.connection,
  });
  private workers: Worker[] = [];

  constructor(
    private readonly outbox: OutboxService,
    private readonly notifications: NotificationsService,
  ) {}

  async onApplicationBootstrap() {
    await this.relayQueue.upsertJobScheduler(
      'relay',
      { every: 1_000 },
      { opts: { removeOnComplete: true, removeOnFail: 100 } },
    );
    this.workers = [
      new Worker(RELAY_QUEUE, () => this.relay(), {
        connection: this.connection,
      }),
      new Worker<PublishedEvent>(
        EVENTS_QUEUE,
        (job) => this.notifications.handle(job.data),
        { connection: this.connection },
      ),
    ];
    for (const worker of this.workers) {
      worker.on('failed', (job, error) =>
        this.logger.error(
          `${worker.name} job ${job?.id} failed: ${error.message}`,
          error.stack,
        ),
      );
    }
  }

  async onApplicationShutdown() {
    await Promise.all(this.workers.map((w) => w.close()));
    await this.relayQueue.close();
    await this.events.close();
    await this.connection.quit();
  }

  private async relay() {
    let relayed: number;
    do {
      relayed = await this.outbox.relay(async (events) => {
        // The event id as job id lets the queue drop a batch published twice.
        await this.events.addBulk(
          events.map((event) => ({
            name: event.type,
            data: event,
            opts: {
              jobId: event.id,
              attempts: 5,
              backoff: { type: 'exponential', delay: 1_000 },
              removeOnComplete: 1_000,
              removeOnFail: 1_000,
            },
          })),
        );
      }, BATCH);
    } while (relayed === BATCH);
  }
}
