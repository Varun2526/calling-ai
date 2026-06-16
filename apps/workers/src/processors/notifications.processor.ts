/**
 * Notifications dispatch processor (queue: `notifications.dispatch`).
 *
 * Domain flow (ARCHITECTURE §8 choreography, BC-12 Notifications): something happens in a
 * context -> it emits `notifications.dispatch.requested.v1` to the outbox -> the relay
 * publishes it here -> this processor delivers across the requested channels
 * (in-app / email / WhatsApp).
 *
 * IMPORTANT (AI_AGENT_GUIDELINES): NO new business logic here. This is a thin adapter that
 * invokes the Notifications application use case (reused from the contexts module, not
 * duplicated). Handler must be IDEMPOTENT under at-least-once delivery — dedupe by the
 * originating event id so a retry never double-sends an email/message.
 */

import type { Job } from 'bullmq';

/** Job payload for `notifications.dispatch`. Always tenant-scoped (ARCHITECTURE §10). */
export interface NotificationJobData {
  organizationId: string;
  /** Immutable id of the event that requested this notification — the dedupe key. */
  eventId: string;
  eventName: string;
  payload: unknown;
}

/** Processor function passed to a BullMQ Worker in main.ts. */
export async function processNotification(job: Job<NotificationJobData>): Promise<void> {
  const { organizationId, eventId } = job.data;
  void organizationId;
  void eventId;

  // TODO: resolve tenant context from job.data.organizationId.
  // TODO: dedupe by eventId (skip if already delivered) — at-least-once safety.
  // TODO: invoke the Notifications use case to resolve rules -> channels and deliver:
  //   await dispatchNotification.execute({ organizationId, eventId, ... });
}
