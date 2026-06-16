/**
 * Outbox relay processor — THE transactional-outbox drain (ARCHITECTURE §8, ADR-0006).
 *
 * Why this exists
 * ---------------
 * When a context mutates an aggregate AND needs a side effect (e.g. "lead created" ->
 * "send notification"), those two things must not be able to half-succeed. So the
 * producing context writes a row to the `OutboxEvent` table **inside the same DB
 * transaction** as the aggregate change. Nothing is published inline.
 *
 * This relay is the second half of that pattern: it reads committed-but-unpublished
 * outbox rows and publishes each one onto the matching BullMQ queue, then marks the row
 * processed. Typed, idempotent handlers in this same app then consume those jobs.
 *
 * Delivery semantics: AT-LEAST-ONCE.
 * ----------------------------------
 * A crash between "publish to BullMQ" and "mark processed" means we will re-publish the
 * same event on the next tick. That is intentional and safe because:
 *   1. We never lose an event (the row stays unprocessed until BullMQ has accepted it).
 *   2. Every downstream handler is idempotent and dedupes by the immutable event id
 *      (ARCHITECTURE §8; AI_AGENT_GUIDELINES "dedupe by event id"). We pass the event id
 *      as the BullMQ `jobId` so BullMQ itself collapses duplicate enqueues within the
 *      retention window as a first line of defense.
 *
 * This is a relay, not a place for business logic (AI_AGENT_GUIDELINES): it only moves
 * already-decided facts from Postgres to Redis/BullMQ.
 */

import { Queue, type ConnectionOptions } from 'bullmq';

import { QUEUE, type QueueName } from '../queues.js';

/** Shape of an outbox row as read from `@propulse/database`. (Mirror of the Prisma model.) */
interface OutboxEventRow {
  /** Immutable event id — used as the BullMQ jobId for idempotent enqueue (dedupe key). */
  id: string;
  /** Tenant scope — every job carries this (ARCHITECTURE §10). */
  organizationId: string;
  /** Fully-qualified event name, e.g. `crm.lead.created.v1` (ARCHITECTURE §8 naming). */
  eventName: string;
  /** Serialized event payload (validated against a contracts schema at the producer). */
  payload: unknown;
  /** Set once the relay has handed the event to BullMQ. */
  processedAt: Date | null;
  createdAt: Date;
}

/**
 * How many outbox rows to drain per poll tick. Keep modest so a backlog drains in
 * fairness-preserving batches rather than monopolizing a connection.
 */
const RELAY_BATCH_SIZE = 100;

/**
 * Map an event name (`<context>.<aggregate>.<fact>.vN`) to the queue that should process
 * it. TODO: replace this hand-rolled switch with the authoritative routing table derived
 * from EVENT_CATALOG.md / `@propulse/contracts` once event<->consumer bindings are frozen.
 */
function routeEventToQueue(eventName: string): QueueName | null {
  if (eventName.startsWith('notifications.')) return QUEUE.NOTIFICATIONS_DISPATCH;
  if (eventName.startsWith('calls.transcript.')) return QUEUE.CALLS_SUMMARIZE;
  if (eventName.startsWith('kb.source.')) return QUEUE.KB_INGEST;
  if (eventName.startsWith('campaign.outreach.')) return QUEUE.CAMPAIGN_OUTREACH;
  // Analytics is a downstream consumer of *every* event (ARCHITECTURE §3) — fan-out to
  // the projection queue is handled separately; omitted here for skeleton brevity.
  return null;
}

/**
 * Run a single relay tick. Invoked on an interval (or via Postgres LISTEN/NOTIFY) by the
 * worker bootstrap in main.ts. Returns the number of events relayed this tick.
 */
export async function runOutboxRelayTick(connection: ConnectionOptions): Promise<number> {
  // 1. Read a batch of committed-but-unprocessed outbox rows.
  //    This is a TENANT-AGNOSTIC SYSTEM QUERY: the relay is platform infrastructure that
  //    legitimately spans all organizations, so it runs through the audited system/admin
  //    path in `@propulse/database` that bypasses the tenant middleware + RLS
  //    (ARCHITECTURE §10 — bypass requires an explicit, audited super-admin path).
  //    TODO: const rows = await systemDb.outboxEvent.findUnprocessed({ take: RELAY_BATCH_SIZE });
  const rows: OutboxEventRow[] = []; // TODO: wire @propulse/database system query.
  void RELAY_BATCH_SIZE;

  // Lazily create one Queue handle per target queue for this tick.
  const queues = new Map<QueueName, Queue>();
  const getQueue = (name: QueueName): Queue => {
    let q = queues.get(name);
    if (!q) {
      q = new Queue(name, { connection });
      queues.set(name, q);
    }
    return q;
  };

  let relayed = 0;
  try {
    for (const row of rows) {
      const target = routeEventToQueue(row.eventName);
      if (!target) {
        // No consumer bound yet. Mark processed so it doesn't block the head of the
        // queue forever; the fact is still durable in the outbox for replay/audit.
        // TODO: await systemDb.outboxEvent.markProcessed(row.id);
        continue;
      }

      // 2. Publish to the matching queue. `jobId = row.id` makes the enqueue idempotent:
      //    re-running this tick after a crash will NOT create a second job for the same
      //    event id within BullMQ's retention window (at-least-once -> effectively-once).
      await getQueue(target).add(
        row.eventName,
        { organizationId: row.organizationId, eventName: row.eventName, payload: row.payload },
        { jobId: row.id },
      );

      // 3. Mark the row processed. If we crash *before* this line, the next tick re-publishes
      //    (at-least-once); downstream handlers dedupe by event id, so this is safe.
      //    TODO: await systemDb.outboxEvent.markProcessed(row.id);

      relayed += 1;
    }
  } finally {
    await Promise.all([...queues.values()].map((q) => q.close()));
  }

  return relayed;
}
