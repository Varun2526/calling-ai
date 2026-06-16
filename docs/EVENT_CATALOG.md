# Propulse AI — Event Catalog (Phase 3)

> **Purpose:** The authoritative registry of every **domain event** in Propulse AI: the event
> envelope, the versioning/immutability/ordering/idempotency policy, a master table of every
> event (emitter, payload, consumers, sync/async notes), the key cross-context choreographies,
> and the checklist for adding a new event. This is the async counterpart to
> [`API_CONTRACTS.md`](API_CONTRACTS.md). Authoritative **payload schemas are the zod
> definitions in [`packages/contracts`](../packages/contracts)** (`<eventName>` schemas); when
> this doc and a schema disagree, the schema wins.
>
> **Owner:** Principal Architect (envelope, policy, choreographies) + the **emitting context's
> CODEOWNER** for each individual event (an event is owned by whoever emits it).
>
> **Update frequency:** **with every new or changed event** — a new event, a new event version
> (`vN+1`), or a payload field change must update this file and the zod schema in the same PR,
> reviewed by the emitting context's owner. Adding a _consumer_ also updates the "Consumed by"
> column.

Builds on [`ARCHITECTURE.md`](ARCHITECTURE.md) §8 (Transactional Outbox → relay → BullMQ → typed
handlers) and [`DOMAIN_RULES.md`](DOMAIN_RULES.md) (the per-context event lists this catalog
indexes verbatim).

---

## 1. Event Envelope

Every domain event is published with this envelope. The `payload` is event-specific and
validated by its zod schema in `packages/contracts`; the envelope is identical across all events.

```jsonc
{
  "eventId": "01J8X...ULID", // unique per emission; the idempotency key for handlers
  "eventName": "crm.lead.created.v1", // <context>.<aggregate>.<pastTenseFact>.v<major>
  "version": 1, // integer major, mirrors the .vN suffix
  "occurredAt": "2026-06-16T10:00:00.000Z", // UTC Instant; when the fact happened
  "organizationId": "org_01J8...", // tenant scope — ALWAYS present, never null (ARCH §10)
  "aggregateId": "lead_01J8...", // id of the aggregate that changed
  "causationId": "01J8X...", // the eventId/commandId that directly caused this
  "correlationId": "01J8X...", // shared across a whole workflow (= API traceId)
  "payload": {
    /* event-specific, zod-validated */
  },
  "metadata": {
    "actor": { "type": "ai|user|system", "id": "..." },
    "schemaVersion": "1.0.0", // semver of the payload schema within this major
    "source": "apps/api|workers|voice-gateway",
    "occurredVia": "rest|webhook|ws|job|saga",
  },
}
```

**Field rules:**

- `organizationId` is mandatory on **every** event — there is no cross-tenant event. It scopes
  the handler's tenant context, Redis keys, and queue routing.
- `correlationId` ties a whole choreography together (e.g. one inbound message through identity
  → reasoning → CRM → notification) and equals the originating HTTP `traceId`/`X-Request-Id`.
- `causationId` is the _direct_ parent (the event/command that triggered this one), enabling a
  causal trace even within a long correlation chain.
- `metadata.schemaVersion` is the **semver within the major** — additive changes bump
  minor/patch; the `.vN` major only changes on a breaking change (below).

### Immutability

Events are **immutable past-tense facts**. Once written to the `outbox` they are never edited or
deleted. Corrections are modeled as _new_ events (e.g. `crm.lead.updated.v1`,
`crm.contact.merged.v1`), never by mutating a prior event. The Conversation timeline and the
audit log follow the same append-only rule (DOMAIN_RULES BC-2, BC-14).

### Versioning policy

- **Additive-only within a major (`vN`):** you may add new optional payload fields or new enum
  values. Consumers MUST tolerate unknown fields and unknown enum values.
- **Breaking change ⇒ new major (`vN+1`):** removing/renaming a field, changing a type, changing
  the meaning/required-ness of a field. The new version is a **new event name**
  (`crm.lead.created.v2`); the old one is emitted in parallel during a deprecation window so
  existing consumers keep working, then retired once all consumers migrate. Never silently
  repurpose `vN`.
- A given emitter emits exactly one major at a time per fact (plus the parallel `vN+1` during
  migration).

### Idempotency

- Delivery is **at-least-once** (Outbox → BullMQ). Every handler MUST be **idempotent**, keyed on
  `eventId` (de-dupe table / processed-set), so a redelivery is a no-op. This mirrors the API
  idempotency-key story (API_CONTRACTS §1.7).
- Producers write the event to the `outbox` **in the same DB transaction** as the aggregate
  change (ARCHITECTURE §8) — the event and the state it describes can never half-commit.

### Ordering

- Ordering is **only guaranteed per aggregate** (per `aggregateId`), achieved by keying the
  BullMQ job on `aggregateId` so one aggregate's events process in order. There is **no global
  ordering** across aggregates or contexts.
- Handlers must not assume cross-aggregate order; they reconcile via `occurredAt` and idempotent
  upserts. The Conversation timeline enforces its own strict intra-conversation order
  (DOMAIN_RULES BC-2).

### Dead-letter handling

- A handler that keeps failing is retried with exponential backoff (per-queue policy); after the
  max attempts the job is moved to a **dead-letter queue (DLQ)** with the full envelope + error.
- DLQ depth is alarmed (CloudWatch) and visible via `GET /admin/queues` (API_CONTRACTS §5.12).
  Jobs are replayable after a fix. **`WorkflowFailure`/escalation notifications must never be
  silently dropped** (DOMAIN_RULES BC-12) — they get their own high-priority alerting.

---

## 2. Master Event Table

Grouped by context, using the **exact event names from `DOMAIN_RULES.md`**. "Consumed by" lists
contexts whose handlers subscribe; **Analytics consumes essentially all events** (read models —
DOMAIN_RULES BC-13) so it is only called out where it is the primary/notable consumer. Side
effects are always async (workers) unless noted "sync".

### IAM (BC-1)

| Event                         | Emitted by | Payload (key fields)               | Consumed by                                     | Sync/Async notes                          |
| ----------------------------- | ---------- | ---------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `iam.organization.created.v1` | IAM        | `organizationId`, `name`, `status` | Organization, Notifications, Analytics          | Async; triggers onboarding flow creation. |
| `iam.user.invited.v1`         | IAM        | `invitationId`, `email`, `role`    | Notifications (send invite email)               | Async.                                    |
| `iam.user.activated.v1`       | IAM        | `userId`, `organizationId`, `role` | CRM (assignment pool), Notifications, Analytics | Async.                                    |
| `iam.role.assigned.v1`        | IAM        | `userId`, `role`, `scope`          | CRM (assignment), Platform Ops (audit)          | Async.                                    |
| `iam.session.revoked.v1`      | IAM        | `sessionId`, `userId`              | API/WS gateway (drop sockets), Platform Ops     | Async; forces WS disconnect.              |

### Organization & Onboarding (BC-9)

| Event                                                          | Emitted by   | Payload (key fields)                                           | Consumed by                                                                     | Sync/Async notes                                                         |
| -------------------------------------------------------------- | ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `org.profile.updated.v1`                                       | Organization | `organizationId`, changed fields (hours, tz, languages, brand) | AI Employee, Appointments, Notifications (config cache invalidation), Analytics | Async; invalidates org-config cache.                                     |
| `org.template.applied.v1`                                      | Organization | `templateId`, `sagaId`, `type`                                 | (saga marker) Analytics, Platform Ops                                           | Async; start of provisioning saga.                                       |
| `org.provision.pipeline.requested.v1` (et al. `…requested.v1`) | Organization | target context + provisioning spec                             | CRM / AI Employee / Campaign / Appointments / Notifications (per intent)        | Async **provisioning intents**; idempotent (re-apply doesn't duplicate). |
| `org.onboarding.step.completed.v1`                             | Organization | `stepId`, `completion`                                         | Analytics                                                                       | Async.                                                                   |
| `org.onboarding.completed.v1`                                  | Organization | `organizationId`                                               | Notifications, Analytics                                                        | Async; org now operational.                                              |

### Knowledge Base (BC-5)

| Event                       | Emitted by     | Payload (key fields)                                      | Consumed by                                                    | Sync/Async notes                 |
| --------------------------- | -------------- | --------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| `kb.source.uploaded.v1`     | Knowledge Base | `sourceId`, `type`, `s3Key?`                              | KB IngestionPipeline (workers), Analytics                      | Async; kicks off ingestion.      |
| `kb.ingestion.started.v1`   | Knowledge Base | `sourceId`, `jobId`                                       | (UI status), Analytics                                         | Async.                           |
| `kb.ingestion.completed.v1` | Knowledge Base | `sourceId`, `documentIds`, `chunkCount`, `embeddingModel` | AI Employee (knowledge availability), Notifications, Analytics | Async; source now retrievable.   |
| `kb.ingestion.failed.v1`    | Knowledge Base | `sourceId`, `reason`                                      | Notifications (`WorkflowFailure`), Platform Ops                | Async; retryable, idempotent.    |
| `kb.source.reindexed.v1`    | Knowledge Base | `sourceId`, `embeddingModel`                              | AI Employee, Analytics                                         | Async; re-embed on model change. |

### AI Employee (BC-1.AI)

| Event                       | Emitted by                        | Payload (key fields)                                         | Consumed by                                                                       | Sync/Async notes                                             |
| --------------------------- | --------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `ai.employee.created.v1`    | AI Employee                       | `aiEmployeeId`, identity, grants                             | Conversation, Voice, Analytics                                                    | Async.                                                       |
| `ai.employee.updated.v1`    | AI Employee                       | `aiEmployeeId`, changed config                               | Conversation, Voice (config cache), Analytics                                     | Async; invalidates AI-config cache.                          |
| `ai.action.intended.v1`     | AI Employee                       | `reasoningSessionId`, `actionType`, params, originating turn | (audit/trace), Analytics                                                          | Async; before grant/permission validation.                   |
| `ai.action.dispatched.v1`   | AI Employee (ActionDispatcher)    | `actionType`, params, target context                         | CRM / Appointments / Campaign / Notifications / Conversation (the owning context) | Async; the validated command-as-event to the owning context. |
| `ai.escalation.raised.v1`   | AI Employee (EscalationEvaluator) | `conversationId`, `reason`, `confidence`                     | Conversation (HandoffCoordinator), Notifications (`HumanEscalation`), Analytics   | Async; low-confidence/rule handoff.                          |
| `ai.reasoning.completed.v1` | AI Employee                       | `reasoningSessionId`, `confidence`, `tokens`, `latency`      | Analytics (cost/metrics), Lead Qualification (engagement factor)                  | Async; cost & quality telemetry.                             |

### Conversation Engine (BC-2) & Channels (BC-10)

| Event                                 | Emitted by                  | Payload (key fields)                                    | Consumed by                                                            | Sync/Async notes                                        |
| ------------------------------------- | --------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `channels.message.received.v1`        | Channels (webhook adapters) | `channel`, `from`, `content`, `mediaRefs`, provider ids | Conversation Engine (identity resolve + append)                        | Async; the normalized inbound entry point.              |
| `conversation.created.v1`             | Conversation Engine         | `conversationId`, `contactId`, `channel`                | CRM, AI Employee, Analytics                                            | Async.                                                  |
| `conversation.message.appended.v1`    | Conversation Engine         | `conversationId`, `message`, direction, author          | AI Employee (reason), Lead Qualification, Analytics, WS gateway (push) | Async; **also pushed live over WS** (API_CONTRACTS §4). |
| `conversation.identity.merged.v1`     | Conversation Engine         | `canonicalContactId`, `mergedIds`                       | CRM (`crm.contact.merged`), Analytics                                  | Async; never merges two different people (BC-2).        |
| `conversation.handoff.requested.v1`   | Conversation Engine         | `conversationId`, `reason`                              | Notifications (`HumanEscalation`), CRM (assignment), WS gateway        | Async.                                                  |
| `conversation.control.transferred.v1` | Conversation Engine         | `conversationId`, `from`, `to` (AI/Human/Paused)        | AI Employee (stop if paused), Notifications, WS gateway, Analytics     | Async; legal transitions only (BC-2).                   |

### Voice / Telephony (BC-3) & Calls (BC-8.Calls)

| Event                             | Emitted by             | Payload (key fields)                                                             | Consumed by                                                                    | Sync/Async notes                                          |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `calls.incoming.received.v1`      | Voice (Twilio webhook) | `callSid`, `from`, `to`                                                          | Voice-gateway (start session), CRM, Analytics                                  | Async ack; live loop in voice-gateway (ARCH §9).          |
| `calls.started.v1`                | Voice                  | `callId`, `direction`, `aiEmployeeId`                                            | Conversation, CRM, Analytics                                                   | Async.                                                    |
| `calls.ended.v1`                  | Voice                  | `callId`, `status`, `duration`                                                   | Calls (start transcription), CRM, Lead Qualification (CallDuration), Analytics | Async; kicks the post-call pipeline.                      |
| `calls.transferred.v1`            | Voice                  | `callId`, `toExecutiveId`                                                        | Notifications, CRM, Analytics                                                  | Async; transfer must never silently fail (BC-3).          |
| `calls.recording.available.v1`    | Voice                  | `callId`, `s3Key`                                                                | Calls (transcription job), Analytics                                           | Async; tenant-prefixed S3 key.                            |
| `calls.transcript.completed.v1`   | Calls                  | `callId`, `transcriptId`, `version`, `segments`                                  | Calls (summarization), Conversation, Analytics                                 | Async; versioned (BC-8.Calls).                            |
| `calls.summary.completed.v1`      | Calls                  | `callId`, `summary`, `actionItems`                                               | CRM (auto-update, traceable), Notifications, Analytics                         | Async.                                                    |
| `calls.sentiment.computed.v1`     | Calls                  | `callId`, `sentiment`                                                            | Lead Qualification (Sentiment factor), Analytics                               | Async.                                                    |
| `calls.requirements.extracted.v1` | Calls                  | `callId`, `leadId`, extracted fields (budget/location/type/config/timeline/loan) | CRM (auto-update, reversible), Lead Qualification                              | Async; CRM update is traceable + reversible (BC-8.Calls). |

### CRM (BC-6)

| Event                       | Emitted by              | Payload (key fields)                        | Consumed by                                                                      | Sync/Async notes                                      |
| --------------------------- | ----------------------- | ------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `crm.contact.created.v1`    | CRM                     | `contactId`, identities                     | Conversation, Campaign, Analytics                                                | Async.                                                |
| `crm.contact.merged.v1`     | CRM                     | `canonicalContactId`, `mergedIds`           | Conversation, Campaign, Analytics                                                | Async; no duplicate contact (BC-6).                   |
| `crm.lead.created.v1`       | CRM                     | `leadId`, `contactId`, `source`, `stage`    | Lead Qualification, Campaign, Notifications (`NewLead`), Appointments, Analytics | Async.                                                |
| `crm.lead.updated.v1`       | CRM                     | `leadId`, changed fields                    | Lead Qualification, Campaign, Analytics                                          | Async.                                                |
| `crm.lead.stage.changed.v1` | CRM                     | `leadId`, `fromStage`, `toStage`, `reason?` | Campaign (stop on convert), Notifications, Analytics                             | Async; `Lost` carries reason (BC-6).                  |
| `crm.lead.assigned.v1`      | CRM (AssignmentService) | `leadId`, `executiveId`, `strategy`         | Notifications (`LeadAssigned`), Analytics                                        | Async; fallback guarantees no unassigned lead (BC-6). |
| `crm.lead.unassigned.v1`    | CRM                     | `leadId`, `reason`                          | CRM (re-assign), Notifications, Analytics                                        | Async; never strands in limbo (BC-6).                 |
| `crm.activity.logged.v1`    | CRM                     | `leadId`, `activityType`, `body`            | Analytics                                                                        | Async.                                                |

### Lead Qualification & Scoring (BC-7)

| Event                              | Emitted by         | Payload (key fields)                       | Consumed by                                                       | Sync/Async notes                                                         |
| ---------------------------------- | ------------------ | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `qualification.answer.captured.v1` | Lead Qualification | `leadId`, `questionId`, `answer`           | Lead Qualification (ScoringEngine), Analytics                     | Async; captured via AI or human.                                         |
| `qualification.completed.v1`       | Lead Qualification | `leadId`, `setId`                          | CRM, Campaign, Analytics                                          | Async.                                                                   |
| `leadscore.updated.v1`             | Lead Qualification | `leadId`, `value`, `category`, `factors[]` | CRM (denormalized score copy), Campaign (segmentation), Analytics | Async; explainable — carries factors (BC-7); CRM copy derived from this. |
| `leadscore.category.changed.v1`    | Lead Qualification | `leadId`, `from`, `to` (Cold/Warm/Hot)     | CRM, Campaign, Notifications, Analytics                           | Async; e.g. Warm→Hot triggers alerts.                                    |

### Campaign Engine (BC-4)

| Event                               | Emitted by                | Payload (key fields)                      | Consumed by                                                           | Sync/Async notes                                                |
| ----------------------------------- | ------------------------- | ----------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `campaign.created.v1`               | Campaign                  | `campaignId`, `type`, `segment`           | Analytics                                                             | Async.                                                          |
| `campaign.launched.v1`              | Campaign                  | `campaignId`                              | Campaign (orchestrator), Notifications (`CampaignStarted`), Analytics | Async; begins outreach.                                         |
| `campaign.leadlist.imported.v1`     | Campaign                  | `campaignId`, `importBatchId`, `count`    | Campaign (dedup), Analytics                                           | Async.                                                          |
| `campaign.leadlist.deduplicated.v1` | Campaign                  | `campaignId`, `dedupedCount`, `survivors` | Campaign (outreach), CRM, Analytics                                   | Async; dedup before outreach (BC-4).                            |
| `campaign.outreach.attempted.v1`    | Campaign                  | `campaignId`, `leadId`, `channel`, `step` | Voice/WhatsApp channels, Analytics                                    | Async; at-most-once per step (BC-4); per-tenant rate limited.   |
| `campaign.outreach.responded.v1`    | Campaign                  | `campaignId`, `leadId`, `outcome`         | Follow-up engine, CRM, Analytics                                      | Async.                                                          |
| `followup.scheduled.v1`             | Campaign (FollowUpEngine) | `leadId`, `trigger`, `dueAt`              | Campaign (scheduler), Analytics                                       | Async.                                                          |
| `followup.fired.v1`                 | Campaign                  | `leadId`, `trigger`                       | Voice/WhatsApp, Notifications (`FollowUpDue`), Analytics              | Async; stops on convert/opt-out.                                |
| `campaign.optout.recorded.v1`       | Campaign                  | `contactId`, `channel?`                   | Campaign (halt outreach), CRM, Notifications, Analytics               | Async; **stops all outreach immediately** (BC-4 never-violate). |
| `campaign.completed.v1`             | Campaign                  | `campaignId`, summary stats               | Notifications (`CampaignCompleted`), Analytics                        | Async.                                                          |

### Appointments (BC-8.Appt)

| Event                                 | Emitted by                       | Payload (key fields)                                   | Consumed by                                                                       | Sync/Async notes                                                        |
| ------------------------------------- | -------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `appointments.sitevisit.requested.v1` | Appointments                     | `leadId`, `type`, slot pref                            | Appointments (SchedulingService), Analytics                                       | Async.                                                                  |
| `appointments.booked.v1`              | Appointments                     | `appointmentId`, `leadId`, `slot`, `type`, `location?` | Notifications (`AppointmentBooked` + reminders), CRM (stage), Campaign, Analytics | Async; **must reliably schedule confirmation + reminders** (BC-8.Appt). |
| `appointments.rescheduled.v1`         | Appointments                     | `appointmentId`, `newSlot`                             | Notifications, CRM, Analytics                                                     | Async.                                                                  |
| `appointments.cancelled.v1`           | Appointments                     | `appointmentId`, `reason`                              | Notifications, CRM, Campaign, Analytics                                           | Async.                                                                  |
| `appointments.reminder.due.v1`        | Appointments (ReminderScheduler) | `appointmentId`, `channel`                             | Notifications (deliver reminder)                                                  | Async; scheduled job.                                                   |
| `appointments.noshow.recorded.v1`     | Appointments                     | `appointmentId`, `leadId`                              | Campaign (reschedule follow-up), CRM, Analytics                                   | Async; triggers MissedSiteVisit follow-up (BC-8.Appt).                  |
| `appointments.completed.v1`           | Appointments                     | `appointmentId`, `outcome`                             | CRM (stage VisitCompleted), Lead Qualification, Analytics                         | Async.                                                                  |

### Notifications (BC-12)

| Event                                 | Emitted by                         | Payload (key fields)                | Consumed by                                     | Sync/Async notes                                                      |
| ------------------------------------- | ---------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `notifications.dispatch.requested.v1` | Notifications (NotificationRouter) | `event`, `recipients`, `channels`   | Notifications (DeliveryService)                 | Async; fan-out per org rules.                                         |
| `notifications.delivered.v1`          | Notifications                      | `requestId`, `recipient`, `channel` | Analytics, WS gateway (InApp push)              | Async; idempotent dedupe by (event id + recipient + channel) (BC-12). |
| `notifications.failed.v1`             | Notifications                      | `requestId`, `channel`, `reason`    | Notifications (retry/backoff→DLQ), Platform Ops | Async; never silently dropped for escalation/`WorkflowFailure`.       |

### Analytics (BC-13) & Platform Ops (BC-14)

| Event                              | Emitted by   | Payload (key fields)                       | Consumed by | Sync/Async notes                                                                                                                     |
| ---------------------------------- | ------------ | ------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| (Analytics emits no domain events) | —            | —                                          | —           | Pure downstream read-model **consumer** of all events; writes no operational state (BC-13).                                          |
| (Platform Ops audit)               | Platform Ops | `auditEntry` (actor, action, subject, org) | —           | Append-only audit on sensitive/cross-tenant actions; consumes events + admin actions (BC-14). Audit log is never editable/deletable. |

---

## 3. Key Choreographies

### 3.1 Inbound lead journey (chat / WhatsApp)

```
Channels (webhook adapter, signature-verified, normalized)
  └─▶ channels.message.received.v1
        └─▶ Conversation Engine: IdentityResolver + append to timeline
              ├─▶ conversation.created.v1            (first contact)
              └─▶ conversation.message.appended.v1   (+ live WS push)
                    └─▶ AI Employee: PromptAssembler → ReasoningOrchestrator
                          ├─▶ ai.reasoning.completed.v1            (cost/quality telemetry)
                          ├─▶ ai.action.intended.v1 → (grant check) → ai.action.dispatched.v1
                          │       ├─▶ crm.lead.created.v1 / crm.lead.updated.v1
                          │       │       └─▶ Notifications: NewLead → notifications.dispatch.requested.v1
                          │       ├─▶ qualification.answer.captured.v1
                          │       │       └─▶ leadscore.updated.v1 → CRM score copy (+ leadscore.category.changed.v1)
                          │       └─▶ appointments.sitevisit.requested.v1 → appointments.booked.v1
                          └─▶ ai.escalation.raised.v1   (low confidence)
                                └─▶ conversation.handoff.requested.v1 → Notifications: HumanEscalation
```

Mirrors ARCHITECTURE §8's representative choreography. Everything after the webhook ack is async.

### 3.2 Outbound campaign journey

```
campaign.created.v1
  └─▶ campaign.launched.v1  (Notifications: CampaignStarted)
        └─▶ campaign.leadlist.imported.v1
              └─▶ campaign.leadlist.deduplicated.v1   (dedup via Conversation identity, BEFORE outreach)
                    └─▶ CampaignOrchestrator (per-tenant rate limited)
                          └─▶ campaign.outreach.attempted.v1   (Voice/WhatsApp via AI Employee)
                                ├─▶ campaign.outreach.responded.v1
                                │       └─▶ FollowUpEngine: followup.scheduled.v1 → followup.fired.v1 (FollowUpDue)
                                ├─▶ crm.lead.stage.changed.v1 → (convert) ─┐ halt outreach for that lead
                                └─▶ campaign.optout.recorded.v1 ───────────┴─▶ HALT all outreach immediately (BC-4)
        └─▶ campaign.completed.v1   (Notifications: CampaignCompleted)
```

### 3.3 Call completed → transcript → summary → CRM update

```
calls.ended.v1
  └─▶ calls.recording.available.v1   (tenant-prefixed S3 key)
        └─▶ Calls: TranscriptionService (Deepgram)
              └─▶ calls.transcript.completed.v1   (versioned, speaker-separated)
                    ├─▶ calls.sentiment.computed.v1 → Lead Qualification (Sentiment factor)
                    └─▶ Calls: SummarizationService (LLM)
                          ├─▶ calls.summary.completed.v1
                          └─▶ calls.requirements.extracted.v1
                                └─▶ CRM auto-update (traceable + reversible: source = this call/summary)
                                      ├─▶ crm.lead.updated.v1
                                      └─▶ leadscore.updated.v1   (CallDuration + Sentiment factors)
```

### 3.4 Appointment booked → reminders

```
appointments.sitevisit.requested.v1
  └─▶ SchedulingService (validate vs business hours + executive availability, no double-book)
        └─▶ appointments.booked.v1
              ├─▶ Notifications: AppointmentBooked → notifications.dispatch.requested.v1 → notifications.delivered.v1
              ├─▶ crm.lead.stage.changed.v1   (→ VisitScheduled)
              └─▶ ReminderScheduler
                    └─▶ appointments.reminder.due.v1 (T-24h, T-2h)
                          └─▶ Notifications: deliver reminder
        ── if missed ──▶ appointments.noshow.recorded.v1
              └─▶ Campaign: MissedSiteVisit follow-up (followup.scheduled.v1 → followup.fired.v1)
```

A booked appointment without a scheduled confirmation + reminders is a defect (DOMAIN_RULES
BC-8.Appt never-violate).

---

## 4. Adding a New Event — Checklist

When you introduce or change an event, in the **same PR**:

1. **Name** it `<context>.<aggregate>.<pastTenseFact>.v1` — past-tense fact, owned by the
   **emitting** context (ARCHITECTURE §8). Confirm it is a _fact_, not a command (commands are
   imperative and are NOT on the bus).
2. **Schema:** add/extend the payload zod schema in `packages/contracts` (named `<eventName>`),
   plus the standard envelope. New field in an existing event → **optional** (additive). Breaking
   change → new major `vN+1` (new event name, dual-emit during migration).
3. **Emit transactionally:** write to the `outbox` in the same DB transaction as the aggregate
   change. Populate `organizationId`, `aggregateId`, `correlationId`, `causationId`,
   `metadata.actor/source`.
4. **Consumers:** identify subscribers; make each handler **idempotent on `eventId`**. Decide the
   ordering key (`aggregateId`) if order matters. Add the BullMQ subscription + DLQ policy.
5. **Tenant safety:** ensure the handler runs in the event's tenant context (no cross-tenant
   read/write); add a cross-tenant handler test.
6. **Catalog:** add a row to §2 (emitter, payload, consumers, sync/async) and update any
   choreography in §3 it participates in.
7. **Tests:** envelope + payload contract test; producer test (event written on state change);
   idempotency test (redelivery is a no-op); DLQ test for the failure path.
8. **Analytics:** confirm whether a projection should consume it (DOMAIN_RULES BC-13). If it
   carries billing-relevant usage (calls/messages/tokens), ensure it is emitted even pre-billing
   (ARCHITECTURE §16).
9. **Docs/owners:** the emitting context's CODEOWNER reviews; bump `metadata.schemaVersion`.
