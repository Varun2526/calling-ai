/**
 * Central registry of BullMQ queue names.
 *
 * Naming convention: `<context>.<job>` — mirrors the bounded contexts in
 * ARCHITECTURE.md §2 so a queue's owner is obvious from its name. Job *data* always
 * carries `organizationId` (ARCHITECTURE §10) so every job is tenant-scoped; Redis keys
 * are likewise namespaced per tenant where state is cached.
 *
 * This file is the single source of truth for queue identifiers shared by producers
 * (apps/api, apps/voice-gateway) and consumers (this app). Keep it free of any runtime
 * logic — it is just constants + types so it can be imported anywhere cheaply.
 */

export const QUEUE = {
  // Knowledge Base ingestion ladder: source -> document -> chunk -> embedding (ARCHITECTURE §9).
  KB_INGEST: 'kb.ingest',
  KB_EMBED: 'kb.embed',

  // Calls & Transcription: post-call finalization pipeline (ARCHITECTURE §9, BC-8).
  CALLS_TRANSCRIBE: 'calls.transcribe',
  CALLS_SUMMARIZE: 'calls.summarize',

  // Campaign Engine: outbound orchestration + follow-up firing (ARCHITECTURE §9, BC-4).
  CAMPAIGN_OUTREACH: 'campaign.outreach',
  FOLLOWUP_FIRE: 'followup.fire',

  // Notifications: multi-channel fan-out delivery (BC-12).
  NOTIFICATIONS_DISPATCH: 'notifications.dispatch',

  // Analytics: read-model projection from domain events (BC-13, read-only).
  ANALYTICS_PROJECT: 'analytics.project',

  // Transactional Outbox relay: drains committed outbox rows to the queues above
  // (ARCHITECTURE §8). This is the backbone of reliable async side effects.
  OUTBOX_RELAY: 'outbox.relay',
} as const;

/** Union of all registered queue names, e.g. `'kb.ingest' | 'calls.transcribe' | ...`. */
export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/** All queue names as an array — handy for iterating when wiring Workers in main.ts. */
export const ALL_QUEUE_NAMES: readonly QueueName[] = Object.values(QUEUE);
