---
feature: "Inbound lead capture & AI qualification via WhatsApp"
slug: "0001-inbound-lead-capture-whatsapp"
owner: "bhanu (Conversation Engine DRI)"
status: "Approved"
target_release: "MVP / R1"
related_adrs: ["adr/0006-event-bus-and-outbox.md", "adr/0001-multi-tenancy-shared-schema-rls.md"]
bounded_contexts: ["channels", "conversation", "ai-employee", "knowledge-base", "crm", "qualification", "appointments", "notifications", "analytics"]
created: "2026-06-16"
last_updated: "2026-06-16"
---

# Inbound lead capture & AI qualification via WhatsApp

> Follows [`../FEATURE_BLUEPRINT.md`](../FEATURE_BLUEPRINT.md). The canonical worked example —
> the inbound choreography from `ARCHITECTURE.md §8`, made concrete end-to-end.

---

## 1. Business requirement

- **Actor / role:** a real-estate **buyer/prospect** messaging the org's WhatsApp number; the
  **AI Employee** acts autonomously on behalf of the **Organization**; a **Sales Executive**
  receives the qualified, assigned lead.
- **Problem / job to be done:** Inbound WhatsApp enquiries today are answered slowly and
  inconsistently, leaking leads. We want an AI Employee to respond instantly, qualify the buyer
  (budget, location, configuration, timeline, intent), create and score a CRM lead, assign it to
  an executive, and — when the buyer is ready — book a site visit, all without a human in the
  loop until escalation is needed.
- **Value & target metric:** cut **first-response time** from minutes/hours to **< 2s p95**;
  reduce lead leakage to ~0 (every inbound becomes an assigned lead); lift **site-visit
  conversion**. Baselines captured by Analytics at launch.
- **In scope:** inbound WhatsApp text (and basic media notes); identity resolution; AI
  qualification dialogue grounded in the KB; lead create + score + assign; optional site-visit
  booking; new-lead/assignment/booking notifications.
- **Out of scope:** outbound WhatsApp campaigns (Campaign Engine, separate feature); voice;
  rich interactive WhatsApp templates/flows; payment.
- **PRD reference:** Inbound journey, `ARCHITECTURE.md §8` choreography.

## 2. Acceptance criteria (Gherkin-style)

```gherkin
Scenario: New buyer messages WhatsApp and gets an instant grounded reply
  Given a buyer whose WhatsApp number is unknown to Organization A
  When they send "Hi, do you have 3BHK in Whitefield under 1.5 Cr?"
  Then Channels verifies the X-Hub-Signature-256 and enqueues an InboundMessage
  And the Conversation Engine resolves a new ChannelIdentity to a new Contact and creates a Conversation
  And the AI Employee replies with a KB-grounded answer within 2s p95
  And the reply is appended to the unified timeline

Scenario: Returning buyer is recognised, not duplicated
  Given a buyer whose WhatsApp number already maps to an existing Contact in Organization A
  When they send a new message
  Then identity resolution links it to the existing Contact (no duplicate Contact, no duplicate Lead opened if one is active)
  And the message appends to that Contact's existing canonical timeline

Scenario: Buyer answers qualification and a scored, assigned lead is created
  Given an active WhatsApp conversation
  When the buyer provides budget, location, configuration and timeline
  Then qualification answers are captured and a LeadScore is computed (Cold/Warm/Hot)
  And a crm.lead.created.v1 lead exists with the denormalized score
  And AssignmentService assigns it to an executive (fallback guarantees no unassigned lead)
  And the assigned Sales Executive receives a new-lead + assignment notification

Scenario: Buyer asks to visit and a site visit is booked
  Given a qualified, assigned lead
  When the buyer agrees to a site visit at an offered slot
  Then the AI emits a BookSiteVisit action intent dispatched to Appointments
  And the slot is validated against business hours + executive availability and booked
  And a booking confirmation notification is dispatched

Scenario: Low AI confidence escalates to a human (no hallucination)
  Given the buyer asks something the KB cannot ground (e.g. an unavailable project price)
  When AI confidence is below the org threshold
  Then the AI does NOT assert an ungrounded fact
  And ai.escalation.raised.v1 is emitted, the conversation ControlState moves AI->Paused
  And a HumanEscalation notification is sent; the paused AI sends no further messages

Scenario: Opted-out contact is never auto-messaged
  Given a Contact with OptOutStatus = opted-out
  When an inbound message arrives
  Then no automated outbound reply is sent (the message is recorded and surfaced for human handling)

Scenario: Tenant isolation
  Given Organization A and Organization B each with WhatsApp leads
  When any A user/endpoint/worker queries leads, conversations, or KB chunks
  Then only Org A data is ever returned, and retrieval never returns Org B chunks
```

## 3. Domain analysis

- **Owning context for capture:** **Conversation Engine** (BC-2) — owns the timeline and identity
  resolution. **Channels** (BC-10) is the upstream adapter.
- **Collaborating contexts:**
  - **AI Employee** (BC-1.AI) — invoked as a domain service to reason and emit `ActionIntent`s
    (customer of KB; commander of CRM/Qualification/Appointments via events).
  - **Knowledge Base** (BC-5) — supplier of grounded retrieval (read).
  - **CRM** (BC-6) — downstream; creates Contact/Lead, assigns.
  - **Lead Qualification** (BC-7) — captures answers, computes score (pure).
  - **Appointments** (BC-8.Appt) — books the optional site visit.
  - **Notifications** (BC-12) — fan-out delivery.
  - **Analytics** (BC-13) — downstream read-model only.
- **Aggregates touched (one aggregate per transaction):**
  - Conversation Engine: `IdentityResolution` (created/linked), `Conversation` (created), `Message`
    appended (within `Conversation`).
  - AI Employee: `ReasoningSession` (ephemeral, Redis) — reads `AIEmployee` config.
  - CRM: `Contact` (created/matched), `Lead` (created, assigned). *Separate transactions, joined
    by events.*
  - Lead Qualification: `LeadScore` (created/updated).
  - Appointments: `Appointment` (requested → booked).
- **New / changed value objects:** none new required for MVP — reuse `Channel.WhatsApp`,
  `ChannelIdentity` (WA id), `MessageContent`, `ConfidenceScore`/`Confidence`, `LeadSource.WhatsApp`,
  `LeadScoreSnapshot`, `ActionType.{CreateLead,AssignExecutive,BookSiteVisit,SearchKnowledge}`,
  `OptOutStatus`. (If WhatsApp message-id dedup needs a typed VO, add `WhatsAppMessageId` in
  Conversation Engine.)
- **Invariants to preserve:** one Contact ⇒ one canonical timeline (merge, never duplicate);
  messages append-only and strictly ordered; `ControlState` transitions only AI→Paused→Human /
  Human→AI; a Lead belongs to exactly one Contact + one Pipeline; **every active Lead is
  assigned** (fallback); score is a pure, explainable function of recorded factors; retrieval is
  tenant-filtered.
- **New invariants introduced:** an inbound WhatsApp message is processed **at-most-once** per
  provider message id (idempotent); a paused AI emits no outbound message.
- **Never-violate rules in play:** never false-merge two real people (prefer separate + flag);
  never assert ungrounded price/inventory facts (ground or escalate); never act outside the AI's
  `ActionGrant`; respect opt-out before any outbound; assignment never drops a lead into limbo.
- **Cross-boundary effects:** all via events/IDs only (see §6) — Channels→Conversation→AI→
  CRM/Qualification/Appointments→Notifications.

## 4. Database changes

- **Prisma model changes (`packages/database`):**
  ```prisma
  // Conversation Engine
  model ChannelIdentity {
    id             String   @id @default(cuid())
    organizationId String
    channel        Channel  // WhatsApp
    externalId     String   // E.164-derived WA id
    contactId      String
    createdAt      DateTime @default(now())
    @@unique([organizationId, channel, externalId]) // dedup identities per tenant
    @@index([organizationId, contactId])
  }

  model Conversation {
    id             String   @id @default(cuid())
    organizationId String
    contactId      String
    status         ConversationStatus
    controlState   ControlState        // AI | Paused | Human
    lastMessageAt  DateTime
    @@index([organizationId, contactId])
    @@index([organizationId, lastMessageAt])
  }

  model Message {
    id                String   @id @default(cuid())
    organizationId    String
    conversationId    String
    direction         MsgDirection
    channel           Channel
    author            MsgAuthor          // AI | Human | Contact
    content           Json
    providerMessageId String?            // WhatsApp message id, for idempotency
    createdAt         DateTime @default(now())
    @@unique([organizationId, channel, providerMessageId]) // at-most-once ingest
    @@index([organizationId, conversationId, createdAt])    // ordered timeline reads
  }
  // CRM Contact/Lead, Qualification LeadScore, Appointments Appointment already exist
  // (DOMAIN_RULES BC-6/7/8); this feature adds no new fields beyond LeadSource.WhatsApp usage.
  ```
- **`organizationId` + tenant middleware:** every model above carries `organizationId` and is
  registered with the Prisma tenant middleware (`REPOSITORY_STRUCTURE.md §5.6`).
- **Migration:** `2026_06_16_add_whatsapp_conversation_capture` — **additive & reversible**
  (new tables/columns only; down-migration drops them). No destructive change.
- **Indexes / uniqueness:** as above — composite `organizationId` indexes for timeline reads and
  identity lookups; `@@unique([organizationId, channel, externalId])` and
  `@@unique([organizationId, channel, providerMessageId])` enforce no-duplicate-identity and
  at-most-once ingest. KB `pgvector` HNSW index already exists (BC-5).
- **RLS policy:** each new table gets a policy `USING (organizationId = current_setting('app.current_org'))`
  for select/insert/update — backstop behind guard + middleware.
- **Partitioning intent:** `Message` is the high-volume append table — created partition-ready
  by `(organizationId, createdAt)` per `ARCHITECTURE.md §12` (deferred until volume warrants).

## 5. API contracts

- **Endpoints:**
  | Method | Path | Auth (action:subject) | Request DTO | Response DTO | Notes |
  |---|---|---|---|---|---|
  | POST | `/webhooks/whatsapp` | signature-verified (no session) | `WhatsAppWebhookEnvelope` | `202 Accepted` | thin adapter: verify `X-Hub-Signature-256` + timestamp/nonce, normalize, enqueue; minimal sync work |
  | GET | `/conversations/:id` | `read:Conversation` | — | `ConversationTimelineDto` | paginated timeline |
  | GET | `/leads/:id` | `read:Lead` | — | `LeadDto` | includes `LeadScoreSnapshot` |
  | GET | `/leads` | `read:Lead` | `ListLeadsQuery` | `Paginated<LeadDto>` | filters: source, score, stage; **paginated** |
- **`packages/contracts` schemas (zod):** `WhatsAppWebhookEnvelope`, `InboundMessageDto` (internal
  normalized), `ConversationTimelineDto`, `MessageDto`, `LeadDto`, `LeadScoreSnapshotDto`,
  `ListLeadsQuery`; shared enums `Channel`, `LeadSource`, `ScoreCategory`. DTOs only — never
  expose `Conversation`/`Lead` aggregates over the wire.
- **WebSocket:** room `org:{organizationId}:conversation:{conversationId}` and
  `org:{organizationId}:notifications:{userId}`; envelope `WsEvent<T>`; pushes `message.appended`,
  `lead.assigned`, `notification.new` to the tenant room only.
- **`API_CONTRACTS.md` updated:** yes.

## 6. Event definitions

All payloads carry `organizationId` + IDs only; all are written to the **Outbox in the same
transaction** as their aggregate change; all consumers are **idempotent**.

- **Emitted / consumed (the choreography):**
  | Event | Emitted by | Payload (IDs only) | Consumed by (idempotency key) |
  |---|---|---|---|
  | `channels.message.received.v1` | Channels | orgId, channel, externalId, providerMessageId, content ref | Conversation Engine (providerMessageId) |
  | `conversation.created.v1` | Conversation Engine | orgId, conversationId, contactId | Analytics |
  | `conversation.identity.merged.v1` | Conversation Engine | orgId, contactId(s) | CRM (contactId pair) |
  | `conversation.message.appended.v1` | Conversation Engine | orgId, conversationId, messageId | AI Employee, Analytics (messageId) |
  | `ai.reasoning.completed.v1` | AI Employee | orgId, reasoningSessionId, confidence, tokens | Analytics |
  | `ai.action.intended.v1` / `ai.action.dispatched.v1` | AI Employee | orgId, actionType, params, originating messageId | target context (actionIntentId) |
  | `crm.lead.created.v1` | CRM | orgId, leadId, contactId, source=WhatsApp | Qualification, Notifications, Analytics (leadId) |
  | `qualification.answer.captured.v1` | Qualification | orgId, leadId, questionType, answer | Qualification scoring (leadId+questionType) |
  | `leadscore.updated.v1` | Qualification | orgId, leadId, scoreValue, category | CRM (projects onto Lead), Analytics (leadId+version) |
  | `crm.lead.assigned.v1` | CRM | orgId, leadId, executiveUserId, reason | Notifications, Analytics (leadId+executiveUserId) |
  | `appointments.sitevisit.requested.v1` | Appointments | orgId, appointmentId, leadId, slot | Appointments scheduling |
  | `appointments.booked.v1` | Appointments | orgId, appointmentId, leadId, executiveUserId, slot | Notifications, CRM (stage), Analytics |
  | `ai.escalation.raised.v1` | AI Employee | orgId, conversationId, reason, confidence | Conversation (handoff), Notifications |
  | `notifications.dispatch.requested.v1` | CRM/Appointments/AI | orgId, event, recipients, channels | Notifications (event id + recipient + channel) |
- **Changed (version bump):** none — all `v1`, additive.
- **`EVENT_CATALOG.md` updated:** yes (all events above registered).

## 7. Backend implementation plan (by layer)

- **Channels** (`contexts/channels/`):
  - presentation: `presentation/controllers/WhatsAppWebhookController.ts` — verify signature
    (port), normalize to `InboundMessage`, enqueue. No business logic.
  - infrastructure: `infrastructure/adapters/WhatsAppSignatureVerifier.ts`,
    `infrastructure/adapters/WhatsAppInboundMapper.ts`; emits `channels.message.received.v1`.
- **Conversation Engine** (`contexts/conversation/`):
  - domain: `IdentityResolver`, `TimelineAssembler`, `HandoffCoordinator` (services);
    `Conversation`/`IdentityResolution` aggregates, `Message` entity; ports
    `ConversationRepository`, `IdentityResolutionRepository`.
  - application: `event-handlers/OnChannelsMessageReceived` (resolve identity → upsert
    Conversation → append Message → write Outbox `conversation.message.appended.v1`); tx + Outbox.
  - infrastructure: `PrismaConversationRepository`, `PrismaIdentityResolutionRepository`, mappers.
  - presentation: `controllers/ConversationController` (GET timeline); WS gateway pushing
    `message.appended` to tenant room.
- **AI Employee** (`contexts/ai-employee/`):
  - domain: `PromptAssembler`, `ReasoningOrchestrator`, `ActionDispatcher` (validate vs
    `ActionGrant`), `EscalationEvaluator`, `LanguageRouter`; `ReasoningSession`.
  - application: `event-handlers/OnConversationMessageAppended` → run reasoning → emit
    `ai.action.intended/dispatched.v1` or `ai.escalation.raised.v1` + `ai.reasoning.completed.v1`.
  - infrastructure: `OpenAiLlmAdapter` (port), `KnowledgeRetrievalClient` (calls KB published
    query), `ReasoningSessionStore` (Redis).
- **Knowledge Base** (`contexts/knowledge-base/`): published `RetrievalService` query reused
  (read only) — no change.
- **CRM** (`contexts/crm/`):
  - domain: `AssignmentService` (strategy + fallback), `PipelineService`; `Contact`/`Lead`.
  - application: `commands/CreateLead`, `commands/AssignLead`, `event-handlers/OnLeadScoreUpdated`
    (project score), `event-handlers/OnIdentityMerged`; emits `crm.lead.created.v1`,
    `crm.lead.assigned.v1`.
  - infrastructure: `PrismaContactRepository`, `PrismaLeadRepository`.
- **Lead Qualification** (`contexts/qualification/`): `ScoringEngine` (pure), `QualificationService`;
  `event-handlers/OnAnswerCaptured` → emit `leadscore.updated.v1` / `leadscore.category.changed.v1`.
- **Appointments** (`contexts/appointments/`): `SchedulingService`; `event-handlers/OnSiteVisitRequested`
  → validate slot → `appointments.booked.v1`.
- **Notifications** (`contexts/notifications/`): `NotificationRouter`/`DeliveryService`;
  `event-handlers` on `crm.lead.created.v1`, `crm.lead.assigned.v1`, `appointments.booked.v1`,
  `ai.escalation.raised.v1` → `notifications.dispatch.requested.v1` → deliver.
- **Workers** (`apps/workers/src/processors/`): `outbox-relay` (publishes committed events to
  BullMQ), `notifications` processor, `analytics-projection` processor. Inbound webhook enqueue
  consumed by a channels processor invoking the Conversation use case.
- **Voice-gateway:** N/A (text feature).
- **Module wiring:** each context's `*.module.ts` binds the ports above to their adapters.

## 8. Frontend implementation plan

- **Route(s):** `apps/web/app/(client)/conversations/[id]/page.tsx`,
  `apps/web/app/(client)/leads/[id]/page.tsx`.
- **Feature slice:** `apps/web/features/conversations/` (timeline view, message bubbles, control-
  state badge, escalation banner) and `apps/web/features/leads/` (lead detail with score
  category + assignment) — each with `api-client` typed by `packages/contracts` and re-used zod
  schemas.
- **Shared UI:** `@propulse/ui` primitives (`DataTable`, `Badge`, `Card`, `Avatar`) composed via
  `apps/web/components/`.
- **Data fetching:** server component loaders for initial timeline/lead; client hooks for live.
- **WebSocket:** subscribe to `org:{orgId}:conversation:{id}` for `message.appended` and the
  control-state/escalation change; `org:{orgId}:notifications:{userId}` for new-lead/assignment.
- **States & role-gating:** loading skeleton, empty conversation, error/retry; a Sales Executive
  sees leads assigned to them (modify), reads all per org; escalation banner visible to
  Sales Manager/Executive.

## 9. Infrastructure requirements

- **Queues (BullMQ):** `channels-inbound` (normalize→Conversation use case), `outbox-relay`,
  `notifications`, `analytics-projection`. Per-tenant rate limit on inbound; retry w/ exp
  backoff; DLQ per queue. Every job payload carries `organizationId`.
- **S3:** inbound WhatsApp media stored at `s3://propulse-media/org/{orgId}/conversations/{id}/...`,
  KMS-encrypted, accessed via short-lived signed URLs.
- **Redis:** `org:{orgId}:aiemployee:{id}:config` (hot config cache, TTL + event invalidation on
  `ai.employee.updated.v1`), `org:{orgId}:identity:{waId}` (resolved-identity cache),
  `org:{orgId}:ratelimit:whatsapp` (counters), `ReasoningSessionStore` keys; pub/sub channel
  `org:{orgId}:ws` for WS fan-out.
- **Third parties:** WhatsApp BSP (inbound webhook + send), OpenAI (LLM + embeddings). Webhook
  `X-Hub-Signature-256` + timestamp/nonce verified. All secrets in AWS Secrets Manager; never in
  the image.
- **IaC (`infra/`):** ECS env for new queues; new env vars (`WHATSAPP_*`, `OPENAI_*`) declared in
  `.env.example` and validated via `packages/config`; CloudWatch dashboard + alarms; IAM
  least-privilege per task (workers may read the media bucket prefix only).

## 10. Testing requirements

- **Unit (domain):** `ScoringEngine` (factors→category, explainable), `AssignmentService`
  (fallback guarantees assignment), `IdentityResolver` (no false-merge), `EscalationEvaluator`
  (threshold), `ActionDispatcher` (rejects non-granted actions). No framework mocks.
- **Integration (application + infra):** `OnChannelsMessageReceived` against a testcontainers
  Postgres (creates Conversation, appends Message, writes Outbox); idempotent re-delivery of the
  same `providerMessageId` produces no duplicate; `leadscore.updated.v1` projection onto Lead.
- **Contract:** validate `WhatsAppWebhookEnvelope`, `LeadDto`, `ConversationTimelineDto`, and
  every event payload in §6 against `packages/contracts` zod (provider + consumer).
- **E2E:** each §2 scenario through the webhook→WS path (and Playwright for the timeline + lead
  detail UI), including the escalation and opt-out scenarios.
- **Cross-tenant (MANDATORY):** Org A token cannot read Org B conversation/lead; KB retrieval for
  Org A never returns Org B chunks; an Org B `providerMessageId` cannot collide into Org A;
  Redis/S3 keys are org-prefixed and unreachable across tenants.
- **Latency:** assert webhook→AI reply **< 2s p95** in a load test (cached config + retrieval).

## 11. Documentation updates

- **Docs to update:** `EVENT_CATALOG.md` (all §6 events — required), `API_CONTRACTS.md`
  (§5 endpoints), `REPOSITORY_STRUCTURE.md` (note new processors if added),
  `runbooks/whatsapp-inbound.md` (new runbook: webhook failures, DLQ drain, escalation backlog),
  `TROUBLESHOOTING.md` (duplicate-message / unresolved-identity entries).
- **ADR required?** No new ADR — relies on existing ADR-0006 (Outbox) and ADR-0001 (tenancy).
  If we add a typed `WhatsAppMessageId` VO or a new shared contract pattern, note it in
  `DOMAIN_RULES.md` (no ADR needed).

## 12. Monitoring requirements

- **Metrics (CloudWatch):** `whatsapp.inbound.received`, `conversation.message.appended`,
  `ai.reply.latency.ms` (p50/p95), `ai.confidence` distribution, `crm.lead.created`,
  `crm.lead.assigned`, `appointments.booked`, `notifications.delivered` — dimensioned by
  `organizationId` where cardinality allows.
- **Alarms:** AI reply p95 > 2s; `channels-inbound` queue age/depth high; any DLQ > 0; webhook
  signature-failure rate spike; OpenAI/WhatsApp provider error rate; **escalation/`WorkflowFailure`
  notification failure** (must never be silently dropped). Routed to on-call.
- **Sentry:** errors tagged with `organizationId`, `conversationId`, correlation id — no PII in
  tags or breadcrumbs.
- **Logs:** structured, correlation-id propagated webhook→worker→WS, tenant-tagged; phone numbers
  and message bodies redacted in logs (`packages/observability`).
- **SLOs:** text turn **< 2s p95** (webhook→AI reply); notification delivered **< 30s p95**;
  inbound message processed (no leakage) within the queue SLA. Measured from the latency metrics.

## 13. Rollback strategy

- **Feature flag:** `feature.whatsapp_inbound_capture` (Platform Ops, **per-org**, default-off).
  Disable = stop processing the inbound queue + return `202` no-op from the webhook (so the BSP
  does not retry-storm); messages still recorded for later replay.
- **Migration reversibility:** the `2026_06_16_add_whatsapp_conversation_capture` migration is
  additive; down-migration drops the new tables/columns. No destructive change.
- **Event back-compat:** all events are new `v1` and additive; consumers ignore unknown fields;
  no existing consumer is changed, so nothing breaks on rollback.
- **Idempotency on replay:** at-least-once delivery is safe — `providerMessageId` uniqueness,
  `actionIntentId`, and notification dedupe keys ensure re-enable after rollback does not
  double-create leads, double-book visits, or double-notify.
- **Kill switch / blast radius:** flipping the per-org flag off isolates the blast radius to that
  org; the webhook stays up (acks) so the BSP relationship is unaffected; in-flight jobs drain or
  park in DLQ.

## 14. Definition of Done

- [ ] Spec approved and current; `status: Shipped` at release.
- [ ] All §2 acceptance scenarios implemented and passing (happy, returning buyer, qualify+assign,
      booking, escalation, opt-out, tenant isolation).
- [ ] Boundaries pass: `pnpm boundaries`, domain-purity grep, `architecture.spec.ts` — no
      cross-context table access; AI Employee only emits intents (writes nothing to CRM/Appt tables).
- [ ] `ChannelIdentity`/`Conversation`/`Message` have `organizationId` + tenant middleware + RLS;
      **cross-tenant isolation test passes** (DB, KB retrieval, Redis, S3).
- [ ] All §5/§6 contracts & events registered in `packages/contracts`, `API_CONTRACTS.md`,
      `EVENT_CATALOG.md`; every consumer idempotent.
- [ ] Unit/integration/contract/e2e/cross-tenant tests green in CI; new domain logic covered.
- [ ] Metrics, alarms (incl. escalation-failure), Sentry tags, redacted logs, SLOs in place.
- [ ] Behind `feature.whatsapp_inbound_capture`; rollback + additive migration verified.
- [ ] Docs + new runbook updated; no ADR needed (existing ADR-0001/0006 cover the patterns).
- [ ] `WHATSAPP_*` / `OPENAI_*` secrets in Secrets Manager; env vars in `.env.example` +
      `packages/config`.
- [ ] Webhook→AI reply **< 2s p95** verified under load.
- [ ] Reviewed by Conversation Engine + CRM CODEOWNERS (and an architect — multi-context feature).
