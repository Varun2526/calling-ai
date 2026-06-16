import type { DomainEvent } from './domain-event.js';

/**
 * Entity: an object with identity. Equality is by id, not by attribute values.
 */
export abstract class Entity<TId> {
  protected constructor(public readonly id: TId) {}

  equals(other?: Entity<TId>): boolean {
    if (!other) return false;
    if (this === other) return true;
    return this.id === other.id;
  }
}

/**
 * AggregateRoot: the consistency boundary and the only object a repository
 * loads/saves. Records domain events to be published AFTER the aggregate is
 * persisted (via the transactional outbox). A single transaction mutates exactly
 * one aggregate instance — cross-aggregate effects flow through events.
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  private _events: DomainEvent[] = [];

  protected addEvent(event: DomainEvent): void {
    this._events.push(event);
  }

  pullEvents(): DomainEvent[] {
    const events = this._events;
    this._events = [];
    return events;
  }

  get hasEvents(): boolean {
    return this._events.length > 0;
  }
}
