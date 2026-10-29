import { Injectable } from '@nestjs/common';
import type { OrderStatus, Prisma, ReturnStatus } from '@marketplace/db';
import { PrismaService } from '../../prisma/prisma.service.js';

export type DomainEvent =
  | {
      type: 'order.status_changed';
      payload: {
        orderId: string;
        from: OrderStatus | null;
        to: OrderStatus;
        actorId: string | null;
      };
    }
  | {
      type: 'return.status_changed';
      payload: {
        orderId: string;
        status: ReturnStatus;
        actorId: string | null;
      };
    }
  | {
      type: 'review.created';
      payload: { orderId: string; reviewId: string; actorId: string };
    };

export type PublishedEvent = DomainEvent & { id: string };

// Call inside the transaction that makes the change, so the event exists exactly when the change does.
export const emit = (tx: Prisma.TransactionClient, event: DomainEvent) =>
  tx.outboxEvent.create({ data: event });

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  // A crash between publish and commit publishes the batch again, so consumers must be idempotent.
  // shortcut: published events are never pruned, add a retention job once the table grows.
  relay(publish: (events: PublishedEvent[]) => Promise<void>, limit = 100) {
    return this.prisma.$transaction(async (tx) => {
      const events = await tx.$queryRaw<PublishedEvent[]>`
        SELECT id, type, payload FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED`;
      if (!events.length) return 0;
      await publish(events);
      await tx.outboxEvent.updateMany({
        where: { id: { in: events.map((e) => e.id) } },
        data: { publishedAt: new Date() },
      });
      return events.length;
    });
  }
}
