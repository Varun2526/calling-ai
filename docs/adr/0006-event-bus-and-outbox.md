# ADR-0006: In-process domain event bus backed by a transactional outbox, relayed to BullMQ

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Principal Architect, Platform team
- **Tags:** events, outbox, messaging, reliability, architecture

---

## Context

Side effects in Propulse AI cross context boundaries: when CRM creates a lead, Notifications
must fire, Analytics must increment, and Lead Qualification may react — but CRM must not know
those contexts exist ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §0 invariant #3, §8;
[`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §4 Violation D). The third non-negotiable
invariant of the system is **"side effects are events, not inline calls."**

The naive approach — emit the event inline (in-memory, or by directly calling the other
context's service) — has two fatal flaws. First, it couples contexts synchronously, defeating
the modular-monolith boundaries ([ADR-0002](0002-modular-monolith-over-microservices.md)).
Second, and worse, it can **half-succeed**: if "lead created" commits but the in-memory
"send notification" handler crashes (or vice versa), state and side effects diverge with no
recovery. We need cross-context side effects that are *transactionally consistent with the
state change that caused them* and *reliably delivered* even across process crashes — without
prematurely adopting an external broker.

## Decision

**We will emit domain events through an in-process event bus backed by a transactional outbox,
relayed to BullMQ for reliable asynchronous, idempotent handling. Delivery is at-least-once;
handlers must be idempotent. Events are immutable past-tense facts named
`<context>.<aggregate>.<pastTenseFact>.v<major>`.**

**The pattern — Transactional Outbox → relay → BullMQ → typed handlers**
([`ARCHITECTURE.md`](../ARCHITECTURE.md) §8):

1. In the **application layer**, the use case writes the domain event to an `outbox` row **in
   the same database transaction** as the aggregate change (the "Outbox-write decision" is an
   application-layer responsibility — [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §2).
   The state change and the intent-to-publish commit atomically, or neither does. No
   half-success.
2. A **relay** (in-process poller / Postgres `LISTEN`, run as the `outbox-relay` processor in
   `apps/workers` — [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §2) publishes
   *committed* events to **BullMQ** over Redis.
3. **Typed handlers** run in `apps/workers`, consuming events to perform cross-context side
   effects.

**Delivery semantics & idempotency.** This gives **at-least-once** delivery with no lost events
on crash. The cost is possible *redelivery*, so **every handler must be idempotent** (dedupe by
event id; e.g. Notifications dedupes by event id + recipient + channel —
[`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-12; Analytics projections are rebuildable/idempotent
by replay — BC-13). Failed handlers retry with backoff, then dead-letter and surface (the
`WorkflowFailure` signal must never be silently dropped — [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-12).

**Events are facts, commands are not.** Events are **past-tense, immutable, versioned facts**.
Commands (imperative, e.g. `BookSiteVisit`) are *not* placed on the bus — they are dispatched
within the owning context's transaction or as request/response
([`ARCHITECTURE.md`](../ARCHITECTURE.md) §5, §8). The AI Employee's actions are commands routed
through its `ActionDispatcher` ([`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-1.AI), distinct from
the facts those commands produce.

**Naming.** `<context>.<aggregate>.<pastTenseFact>.v<major>` — e.g. `crm.lead.created.v1`,
`calls.transcript.completed.v1`, `campaign.outreach.attempted.v1`. The `v<major>` is bumped on
breaking schema change. The authoritative registry is [`EVENT_CATALOG.md`](../EVENT_CATALOG.md);
event schemas live in `packages/contracts`.

**Tenant scope.** Every event/job carries `organizationId`
([ADR-0001](0001-multi-tenancy-shared-schema-rls.md);
[`ARCHITECTURE.md`](../ARCHITECTURE.md) §10).

## Consequences

- **Positive:**
  - No lost events and no half-success: the outbox makes side effects transactionally
    consistent with the state that triggered them.
  - Contexts are decoupled — adding a new consumer (e.g. a Slack sink, a data-warehouse export,
    a future Billing context consuming usage events) touches zero existing code
    ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §16).
  - The in-process bus + outbox is a clean seam: extraction later swaps the relay's target for
    SNS/SQS or Kafka without changing handlers ([ADR-0002](0002-modular-monolith-over-microservices.md)).
  - Queues double as shock absorbers and rate-limit points for third parties
    ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §12).
- **Negative / accepted trade-offs:**
  - **Eventual consistency** across contexts — consumers see effects shortly *after* the commit,
    not within it. Workflows must tolerate this.
  - **At-least-once** forces idempotency everywhere; a non-idempotent handler is a latent bug
    (double notifications, double-counted metrics).
  - The relay is operational surface (lag, dead-letter queues) that must be monitored.
  - Event versioning + a published catalog is ongoing maintenance.
- **Follow-ups / obligations:**
  - Keep [`EVENT_CATALOG.md`](../EVENT_CATALOG.md) and `packages/contracts` event schemas in
    lockstep; every new/changed event updates both in the same PR.
  - Monitor outbox-relay lag and dead-letter depth; runbook for replays.
  - Idempotency keys are part of the handler contract — enforced in review and tests.

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Inline / synchronous cross-context calls** | Simplest; immediately consistent | Tight coupling (breaks boundaries); half-success on partial failure; no recovery | ❌ rejected — the Violation D anti-pattern |
| **In-memory event bus, no outbox** | Decoupled, no broker | Events lost on crash between commit and dispatch; no at-least-once guarantee | ❌ rejected — loses events; unacceptable for "lead created → notify" |
| **External broker (Kafka/SNS-SQS) from day one** | Durable, scalable, decoupled | Premature infra + ops cost for V1; the outbox already gives us the seam to adopt it later | ❌ deferred — adopt on extraction, not now |
| **Transactional outbox → relay → BullMQ, idempotent handlers (chosen)** | Atomic with state change; at-least-once; decoupled; clean extraction seam | Eventual consistency; mandatory idempotency; relay to operate | ✅ **chosen** |

## Related

- Docs: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §0 (invariant #3), §7, §8, §9, §12, §16;
  [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-12, BC-13, BC-1.AI;
  [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §2, §4 (Violation D);
  [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §2; [`EVENT_CATALOG.md`](../EVENT_CATALOG.md).
- ADRs: [ADR-0002](0002-modular-monolith-over-microservices.md) (events make extraction
  mechanical); [ADR-0001](0001-multi-tenancy-shared-schema-rls.md) (every event carries
  `organizationId`).
