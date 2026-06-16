// The event envelope — identical across every domain event (EVENT_CATALOG.md §1). The
// `payload` is event-specific and validated by its own schema; here it is left as an
// unknown record. `organizationId` is ALWAYS present — there is no cross-tenant event.

import { z } from 'zod';

import { eventNameSchema } from './event-names.js';

export const actorTypeSchema = z.enum(['ai', 'user', 'system']);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const eventMetadataSchema = z.object({
  actor: z.object({
    type: actorTypeSchema,
    id: z.string(),
  }),
  /** Semver of the payload schema WITHIN this major (additive bumps minor/patch). */
  schemaVersion: z.string(),
  source: z.string(),
  occurredVia: z.enum(['rest', 'webhook', 'ws', 'job', 'saga']),
});
export type EventMetadata = z.infer<typeof eventMetadataSchema>;

export const eventEnvelopeSchema = z.object({
  /** Unique per emission; the idempotency key for handlers. */
  eventId: z.string().min(1),
  eventName: eventNameSchema,
  /** Integer major, mirrors the `.vN` suffix. */
  version: z.number().int().positive(),
  /** UTC instant the fact happened. */
  occurredAt: z.string().datetime(),
  /** Tenant scope — never null. */
  organizationId: z.string().min(1),
  /** Id of the aggregate that changed. */
  aggregateId: z.string().min(1),
  /** The eventId/commandId that directly caused this. */
  causationId: z.string().min(1),
  /** Shared across a whole workflow (= API traceId). */
  correlationId: z.string().min(1),
  /** Event-specific, validated by its own schema. */
  payload: z.record(z.unknown()),
  metadata: eventMetadataSchema,
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;
