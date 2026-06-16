import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@propulse/domain-kernel';
import type { PrismaClient } from '@propulse/database';

/**
 * OutboxService — writes domain events to the `outbox_events` table **in the same
 * transaction** as the aggregate change (transactional outbox, ADR-0006). A separate relay
 * in apps/workers publishes committed rows to BullMQ (at-least-once, idempotent handlers).
 * This guarantees a side effect never half-succeeds: either the state change AND its events
 * commit, or neither does.
 *
 * Application command handlers call `enqueue(tx, aggregate.pullEvents())` right after saving
 * the aggregate within their transaction. They must NOT call other contexts directly.
 */
@Injectable()
export class OutboxService {
  async enqueue(tx: PrismaClient, events: DomainEvent[]): Promise<void> {
    if (events.length === 0) return;
    await tx.outboxEvent.createMany({
      data: events.map((e) => ({
        organizationId: e.organizationId,
        eventName: e.eventName,
        aggregateId: e.aggregateId,
        payload: JSON.parse(JSON.stringify(e)) as object,
        occurredAt: e.occurredAt,
      })),
    });
  }
}
