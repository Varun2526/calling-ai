/**
 * Base for all domain events. Events are immutable past-tense facts named
 * `<context>.<aggregate>.<pastTenseFact>.v<major>` (see EVENT_CATALOG.md).
 * Every event is tenant-scoped (organizationId) and carries correlation metadata
 * so a request can be traced through the outbox -> BullMQ pipeline.
 */
export interface DomainEventMetadata {
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly [key: string]: unknown;
}

export abstract class DomainEvent {
  /** e.g. "crm.lead.created.v1" — must match the EVENT_CATALOG entry. */
  abstract readonly eventName: string;
  readonly occurredAt: Date;

  protected constructor(
    public readonly organizationId: string,
    public readonly aggregateId: string,
    public readonly metadata: DomainEventMetadata = {},
    occurredAt?: Date,
  ) {
    // occurredAt is injected (or defaulted) rather than read from a global clock so
    // domain logic stays deterministic and testable.
    this.occurredAt = occurredAt ?? new Date();
  }
}
