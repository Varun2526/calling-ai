import { Injectable } from '@nestjs/common';
import type { DomainEvent } from '@propulse/domain-kernel';

export type EventHandler = (event: DomainEvent) => Promise<void> | void;

/**
 * In-process domain event bus for synchronous, same-process reactions that do NOT need
 * durability (e.g. cache invalidation). Durable, cross-context side effects must go through
 * the OutboxService -> BullMQ instead (ADR-0006). Kept deliberately tiny; when a context is
 * extracted to its own service, this is swapped for SNS/SQS or Kafka with no domain changes.
 */
@Injectable()
export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(eventName: string, handler: EventHandler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.eventName) ?? [];
    await Promise.all(list.map((h) => h(event)));
  }
}
