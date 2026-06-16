# Propulse AI — System Architecture (Phase 1)

> **Owner:** Principal Architect · **Update frequency:** every architecturally
> significant change (paired with an [ADR](adr/)) · **Audience:** all engineers + AI agents.
> This is the canonical architecture document. [`DOMAIN_RULES.md`](DOMAIN_RULES.md),
> [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) and
> [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) refine specific facets of what is decided here.

---

## 0. Architectural Stance (read this first)

Propulse AI is a **multi-tenant, event-driven modular monolith** built as a Turborepo
monorepo. We deliberately reject a microservices-first design for V1. The reasoning,
trade-offs, and the exact rule for when we extract a service are in
[ADR-0002](adr/0002-modular-monolith-over-microservices.md). Every bounded context is a
**NestJS module with a hard, lint-enforced boundary** so that any context can later be lifted
into its own deployable service *without a rewrite* — the seams are designed in from day one.

Three non-negotiable invariants govern everything below:

1. **Tenant isolation is sacred.** Every row, every cache key, every queue job, every S3
   object, and every vector is scoped to an `organizationId`. There is no code path that
   reads tenant data without a tenant context. Enforced in depth (app guard → Prisma
   middleware → Postgres RLS). See §10.
2. **The domain core never imports infrastructure.** Twilio, OpenAI, Prisma, BullMQ, S3, and
   Redis are details behind ports. The "AI employee" reasoning logic must be unit-testable
   with zero network. See [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md).
3. **Side effects are events, not inline calls.** When a lead is created, the CRM does not
   call the Notification service directly. It emits `crm.lead.created.v1`. This is what makes
   the system extensible without modifying existing contexts. See §8.

---

## 1. High-Level System Architecture

```
                                 ┌──────────────────────────────────────────┐
   External actors / channels    │                CLIENTS                    │
                                 │  Client Dashboard (Next.js)               │
   Buyer ──┐                     │  Super Admin / Ops Console (Next.js)      │
   Prospect┤                     └──────────────────┬───────────────────────┘
           │                                        │ HTTPS / WSS
   ┌───────▼─────────┐                ┌─────────────▼───────────────┐
   │  Website Chat   │                │      Edge / ALB (AWS)        │
   │  WhatsApp BSP   │── webhooks ───▶│   WAF · TLS · rate limiting  │
   │  Twilio (PSTN)  │                └─────┬───────────────┬────────┘
   │  Meta/Google    │                      │               │
   │  Lead Forms     │              ┌───────▼──────┐  ┌──────▼─────────────┐
   └─────────────────┘              │  apps/api    │  │ apps/voice-gateway │
                                    │  (NestJS)    │  │ (NestJS, realtime) │
                                    │  REST + WS   │  │ media streams, STT │
                                    │  modular     │  │ /TTS orchestration │
                                    │  monolith    │  └──────┬─────────────┘
                                    └──┬────┬───┬──┘         │
                  in-process domain bus│    │   │            │ enqueue jobs
                       + Outbox        │    │   │            │
                            ┌──────────▼┐   │   │   ┌────────▼─────────────┐
                            │ PostgreSQL │  │   │   │   Redis / ElastiCache │
                            │ + pgvector │  │   │   │  cache · pub/sub · BullMQ
                            │ + FTS      │  │   │   └────────┬─────────────┘
                            └────────────┘  │   │            │ consume
                                            │   │   ┌────────▼─────────────┐
                            ┌───────────────▼┐  │   │   apps/workers        │
                            │    AWS S3       │  │   │  (BullMQ processors)  │
                            │ recordings,docs │  │   │  ingestion, transcribe│
                            └─────────────────┘  │   │  campaigns, follow-ups│
                                                 │   │  notifications, embed │
                            ┌────────────────────▼┐  └───────┬──────────────┘
                            │ External AI / Comms  │          │
                            │ OpenAI · Deepgram ·  │◀─────────┘ calls out via ports
                            │ ElevenLabs · WhatsApp│
                            │ Google Maps · SES    │
                            └──────────────────────┘

  Observability spans everything: CloudWatch (metrics/logs/alarms) + Sentry (errors/traces).
```

**Deployable units (ECS Fargate services):**

| Service | Responsibility | Scaling signal |
|---|---|---|
| `apps/web` | Next.js dashboards (client + admin) | CPU / request count |
| `apps/api` | REST + WebSocket gateway, all synchronous domain operations | CPU / p95 latency |
| `apps/voice-gateway` | Long-lived voice/media sessions, realtime STT↔LLM↔TTS loop | concurrent active calls |
| `apps/workers` | All async work (queues). One image, multiple queue-bound process types | queue depth per queue |

Voice is split out from `apps/api` from day one because its runtime profile is
fundamentally different (long-lived stateful WebSocket/media sessions, latency-critical,
must not be killed by a routine API deploy). See [ADR-0005](adr/0005-voice-gateway-separation.md).

---

## 2. Major Subsystems

1. **Identity & Access (IAM)** — orgs-as-tenants, users, roles, invitations, sessions.
2. **Organization & Onboarding** — org profile/config, real-estate templates, the < 30-min wizard.
3. **Knowledge Base** — source ingestion, extraction, chunking, embeddings, RAG retrieval.
4. **AI Employee** — agent identity/personality/permissions/goals/escalation + prompt assembly + reasoning orchestration (the "brain").
5. **Conversation Engine** — unified cross-channel timeline, sessions, messages, identity resolution.
6. **Channels** — adapters: Website Chat, WhatsApp, Voice/PSTN, Meta/Google lead forms, CSV/API import.
7. **Voice / Telephony** — call lifecycle, realtime media, recordings (runs in voice-gateway + workers).
8. **Calls & Transcription** — recordings, transcripts, AI summaries, sentiment, searchable intelligence.
9. **CRM** — contacts, leads, pipeline, activities, assignment.
10. **Lead Qualification & Scoring** — configurable qualification questions, scoring engine, hot/warm/cold.
11. **Campaign Engine** — inbound + outbound campaigns, lead lists, segmentation, outreach orchestration, follow-up engine.
12. **Appointments** — site visits / virtual / phone consults, scheduling, reminders, calendar, maps.
13. **Notifications** — multi-channel (in-app/email/WhatsApp) event-driven delivery.
14. **Analytics & Reporting** — metrics aggregation, dashboards, ROAS/CPL.
15. **Platform Ops / Admin** — super admin, audit log, system health, feature flags.

These map 1:1 to bounded contexts (next section) and to NestJS modules (Phase 3).

---

## 3. Bounded Contexts & Domain Classification

We classify each context using DDD's core/supporting/generic distinction. This drives where
we invest senior engineering effort vs. where we buy/standardize.

| # | Bounded Context | Class | Why |
|---|---|---|---|
| BC-1 | **AI Employee** | **Core** | The product *is* "human-like AI employees". Differentiation lives here. |
| BC-2 | **Conversation Engine** | **Core** | Unified cross-channel memory/timeline is the moat. |
| BC-3 | **Voice / Telephony** | **Core** | "Was that a person or AI?" — realtime voice quality is core. |
| BC-4 | **Campaign Engine** | **Core** | Outbound autonomous outreach + follow-up is a primary revenue driver. |
| BC-5 | **Knowledge Base** | Supporting | RAG quality matters but uses standard patterns. |
| BC-6 | **CRM** | Supporting | Table-stakes but specific to real-estate pipeline. |
| BC-7 | **Lead Qualification & Scoring** | Supporting | Configurable rules + scoring; bespoke but bounded. |
| BC-8 | **Appointments** | Supporting | Domain-specific scheduling rules. |
| BC-9 | **Organization & Onboarding** | Supporting | The templates engine is differentiating; rest is config. |
| BC-10 | **Channels** | Generic-ish | Adapters around 3rd-party APIs. |
| BC-11 | **IAM** | Generic | Standard RBAC/tenancy — minimize custom code. |
| BC-12 | **Notifications** | Generic | Standard fan-out delivery. |
| BC-13 | **Analytics** | Generic | Read-model aggregation. |
| BC-14 | **Platform Ops / Admin** | Generic | Cross-cutting tooling. |

**Context map (relationships):**

- IAM is **upstream** of everything (shared kernel for `OrganizationId`, `UserId`, `Role`).
- Conversation Engine is the **hub**; Channels are upstream adapters that feed it.
- AI Employee is invoked **by** Conversation Engine and Voice as a *domain service*; it
  *queries* Knowledge Base (customer/supplier) and *commands* CRM/Appointments/Notifications
  via its action set — but does so by **emitting intents/events**, never by reaching into
  their tables.
- Campaign Engine is a **consumer** of CRM (lead lists), AI Employee (outreach), Conversation
  Engine, and Appointments — it orchestrates them via events.
- Analytics is a pure **downstream read-model consumer** of every context's events. It owns
  no write authority over operational data.

---

## 4. Domain Definitions (ubiquitous language)

Canonical terms (full glossary + invariants in [`DOMAIN_RULES.md`](DOMAIN_RULES.md)):

- **Organization** — the tenant. Synonymous with "client/business". Root of all data ownership.
- **Contact** — a real-world person (buyer/prospect), deduplicated across channels via identity resolution.
- **Lead** — a *sales opportunity* attached to a Contact within a pipeline. A Contact may have multiple Leads over time. (Contact ≠ Lead — see DOMAIN_RULES.)
- **Conversation** — a channel-spanning thread of interaction with one Contact. Has a unified **Timeline**.
- **Message** — a single utterance/turn within a Conversation (inbound or outbound, any channel).
- **AI Employee** — a configured autonomous agent instance owned by an Organization. Has identity, personality, knowledge bindings, permitted actions, goals, escalation rules.
- **Knowledge Source** → **Document** → **Chunk** → **Embedding** — the KB ingestion ladder.
- **Call** — a voice (PSTN/realtime) interaction; produces Recording, Transcript, Summary.
- **Campaign** — an inbound or outbound program operating over a Segment of Leads/Contacts.
- **Appointment** — a scheduled Site Visit / Virtual Meeting / Phone Consultation.
- **Assignment** — the binding of a Lead/Conversation to a human Executive.
- **Escalation / Handoff** — transfer of control from AI to a human (and back).

---

## 5. Service Boundaries (rules of engagement)

1. **One context = one module = one schema namespace.** A context owns its tables exclusively.
2. **No cross-context table reads.** Context B never `SELECT`s from context A's tables, nor
   `JOIN`s across them. It calls A's public application service or consumes A's events.
3. **Communication is one of exactly three kinds:**
   - **Synchronous query** (read) via a context's published interface (in-process now, gRPC/HTTP if extracted).
   - **Synchronous command** only within a request's own transaction boundary and only for the context that owns the data.
   - **Asynchronous event** for everything that crosses a context boundary as a side effect.
4. **IDs cross boundaries, not entities.** Contexts exchange `LeadId`, `ContactId`,
   `OrganizationId` — not each other's aggregate objects. Each side maps to its own model.
5. **The AI Employee's "actions" are commands to other contexts**, dispatched through an
   **Action Dispatcher** port. e.g. `BookSiteVisit` → `appointments.command.book` →
   Appointments context. The AI never writes to the appointments table.

---

## 6. Data Ownership Rules

| Data | Owning context | Notes |
|---|---|---|
| Organizations, Users, Roles, Invitations, Sessions | IAM | Shared-kernel IDs; everyone reads `organizationId` via auth context, not via the users table. |
| Org config, templates, onboarding state | Organization | |
| Knowledge sources, documents, chunks, **embeddings (pgvector)** | Knowledge Base | Embeddings live in KB-owned tables. |
| AI Employee configs, prompts, personality, action grants | AI Employee | |
| Conversations, Messages, Timeline, identity-resolution graph | Conversation Engine | Single source of truth for "what was said". |
| Contacts, Leads, Pipeline stages, Activities, Assignments | CRM | |
| Qualification question sets, lead scores | Lead Qualification | Score is *projected onto* the Lead via event, CRM stores a denormalized copy. |
| Calls, recordings (S3 keys), transcripts, summaries, sentiment | Calls | |
| Campaigns, lead lists, segments, outreach attempts, follow-up rules/state | Campaign Engine | |
| Appointments, reminders, calendar links | Appointments | |
| Notification rules, delivery records | Notifications | |
| Read models / aggregates / dashboards | Analytics | **Read-only** copies built from events. Never authoritative. |
| Audit log, feature flags, system health | Platform Ops | Append-only audit. |

**Rule:** if two contexts seem to "need the same table", one of them is wrong about ownership.
Resolve by deciding who owns the *write authority*; the other gets a read model via events.

---

## 7. Communication Patterns

- **Client ↔ api:** REST (commands/queries) + WebSocket (live conversation/agent status, presence, notifications).
- **Channels → api:** inbound webhooks (WhatsApp, Twilio, Meta/Google) hit thin adapter
  controllers that **validate signatures**, normalize to an internal `InboundMessage`, and
  enqueue — they do minimal synchronous work.
- **api ↔ voice-gateway:** voice-gateway owns the realtime loop; it calls back into domain
  services (AI Employee reasoning, KB/CRM search) via the same application layer and enqueues
  post-call jobs (transcription finalization, summary, CRM update).
- **api/voice ↔ workers:** BullMQ jobs over Redis. Producers enqueue; workers consume.
- **Cross-context side effects:** domain events on an **in-process event bus** backed by a
  **transactional Outbox** table (see §8), drained to BullMQ for reliable async handlers.
- **Realtime push to clients:** workers/api publish to a Redis pub/sub channel; the WebSocket
  gateway fans out to the right tenant rooms.

---

## 8. Event-Driven Architecture

**Pattern: Transactional Outbox → relay → BullMQ → typed handlers.**

Why not emit events inline? Because "lead created" + "send notification" must not be able to
half-succeed. We write the event to an `outbox` row **in the same DB transaction** as the
aggregate change. A relay (in-process poller / Postgres `LISTEN`) publishes committed events
to BullMQ. Handlers are idempotent and run in `apps/workers`. This gives at-least-once
delivery with no lost events on crash. Full rationale: [ADR-0006](adr/0006-event-bus-and-outbox.md).

**Event naming:** `<context>.<aggregate>.<pastTenseFact>.v<major>` — e.g.
`crm.lead.created.v1`, `calls.transcript.completed.v1`, `campaign.outreach.attempted.v1`.
Events are **facts** (past tense), immutable, versioned. Commands are imperative and not on
the bus. The authoritative registry is [`EVENT_CATALOG.md`](EVENT_CATALOG.md).

**Representative event choreography — inbound journey:**

```
channels.message.received.v1
   └─▶ Conversation Engine: resolve identity, append to timeline
        └─▶ conversation.message.appended.v1
             ├─▶ AI Employee: reason → may emit action intents
             │     ├─▶ crm.lead.upserted.v1
             │     ├─▶ qualification.answer.captured.v1 ─▶ leadscore.updated.v1
             │     ├─▶ appointments.sitevisit.requested.v1 ─▶ appointments.booked.v1
             │     └─▶ ai.escalation.raised.v1 (if low confidence)
             └─▶ Analytics: increment conversation/response-time read models
  (any of the above) ─▶ notifications.dispatch.requested.v1 ─▶ delivery
```

---

## 9. Synchronous vs Asynchronous Workflows

| Synchronous (request/response, user is waiting) | Asynchronous (queued, eventually consistent) |
|---|---|
| Auth, RBAC checks | Knowledge ingestion (extract→chunk→embed→index) |
| CRUD on org/AI-employee config | Embedding generation / re-indexing |
| Loading dashboards, lead lists, a conversation timeline | Transcription, AI summary, sentiment, CRM auto-update |
| KB/CRM **search** during a live conversation (must be fast: cache + pgvector) | Campaign execution, outbound call/WhatsApp dispatch |
| Posting a chat message (then async fan-out) | Follow-up scheduling and firing |
| Booking/rescheduling an appointment (the write) | Notification delivery, reminders |
| Voice realtime loop (low-latency, but a special "online async" pipeline) | Analytics aggregation, CSV/lead-list import & dedup |

**Rule of thumb:** if it touches a third party with variable latency, can be retried, or
isn't needed to render the user's current screen — it's a queue job. The voice realtime loop
is the one latency-critical "streaming" exception and lives in voice-gateway.

---

## 10. Multi-Tenancy Strategy

**Decision: single database, shared schema, `organizationId` discriminator, defended by
Postgres Row-Level Security + a Prisma tenant-scoping middleware + an application tenant
guard.** Compared alternatives in [ADR-0001](adr/0001-multi-tenancy-shared-schema-rls.md):

| Option | Isolation | Ops cost | Cross-tenant analytics | Verdict |
|---|---|---|---|---|
| DB per tenant | Strongest | High (migrations × N, connection sprawl) | Hard | ❌ premature for an internally-managed V1 |
| Schema per tenant | Strong | Medium-high (migration fan-out) | Medium | ❌ same migration pain, marginal gain |
| **Shared schema + RLS** | Strong *if enforced in depth* | Low | Easy | ✅ **chosen** |

**Defense in depth (all three required):**
1. **App guard** derives `organizationId` from the authenticated session (never from request
   body) and binds it to a request-scoped tenant context.
2. **Prisma middleware** auto-injects `where: { organizationId }` on every query for
   tenant-scoped models and rejects writes lacking it.
3. **Postgres RLS** policies key off a `SET app.current_org` GUC per connection/transaction —
   the final backstop if app code has a bug. Super-admin uses a separate role that can bypass
   RLS *only* through audited admin endpoints.

Tenant scoping extends to: **Redis keys** (`org:{id}:...`), **BullMQ job data** (every job
carries `organizationId`), **S3 prefixes** (`s3://bucket/org/{id}/...`), and **pgvector
queries** (filtered by `organizationId`). A tenant's data physically cannot be addressed
without its id.

---

## 11. Authorization Strategy

**Two-dimensional: tenant scope × role-based permissions, with resource-level checks.**

- **Tenant scope** (above) answers "which org's data". Always applied first.
- **RBAC** answers "what can this role do". Roles (PRD): Super Admin, Operations Admin,
  Client Owner, Sales Manager, Sales Executive, Pre-Sales Executive, Support.
- We model permissions as `(action, subject)` pairs (e.g. `update:Lead`, `read:Analytics`,
  `manage:Organization`) and evaluate with a policy layer (**CASL**-style ability), not
  scattered `if (role === ...)` checks. See [ADR-0003](adr/0003-rbac-casl-policy-layer.md).
- **Platform vs tenant roles:** Super Admin / Operations Admin are *platform* roles spanning
  orgs (and are the only ones that may cross tenant boundaries, through audited endpoints).
  Client Owner…Support are *tenant* roles scoped to one org.
- **Resource ownership refinements:** a Sales Executive can read all leads in their org but
  may only *modify* leads assigned to them (configurable per org). Assignment rules feed this.
- Every authorization decision on sensitive resources is **audit-logged** (Platform Ops).

ABAC was considered for the assignment-based rules; we keep RBAC as the spine and express the
few attribute rules (e.g. "assigned-to-me") as policy conditions — full ABAC is deferred.

---

## 12. Scalability Considerations

- **Stateless api/web/workers** → horizontal scale on ECS Fargate behind ALB. No in-memory
  session state (sessions in Redis/JWT). 
- **voice-gateway** scales on **concurrent active calls**; sessions are sticky to a task for
  their lifetime, with state checkpointed to Redis so a draining task can hand off.
- **Queues as shock absorbers:** spikes (a 50k-lead campaign import, a webhook storm) land in
  BullMQ and drain at a controlled rate. Per-queue concurrency and rate limits protect
  downstream third parties (WhatsApp/Twilio/OpenAI quotas).
- **Database:** RDS Postgres with a read replica for Analytics/heavy reads; PgBouncer for
  connection pooling (Fargate task count × Prisma pool can exhaust connections fast).
- **pgvector:** start in-DB (HNSW index). Documented exit ramp to a dedicated vector store if
  recall/latency at scale demands it (see [PERFORMANCE_GUIDELINES.md](PERFORMANCE_GUIDELINES.md)).
- **Partitioning roadmap:** high-volume append tables (messages, call transcripts, analytics
  events) are partition-ready (by time and/or `organizationId`).
- **Per-tenant fairness:** campaign/outreach workers use per-org rate limiting so one large
  tenant cannot starve others (noisy-neighbor control).

---

## 13. Performance Considerations

- **Conversation latency budget (text):** webhook→AI reply target **< 2s p95**. KB/CRM search
  must be cached and pgvector queries indexed; prompt assembly precomputed where possible.
- **Voice latency budget:** end-to-end turn (user stops speaking → AI audio starts) target
  **< 1.2s p95** — this is the make-or-break "is it human?" metric. Stream STT partials, start
  LLM on partials, stream TTS; never wait for full transcription.
- **Caching tiers (Redis):** org config & AI-employee config (hot, rarely changes),
  resolved-identity lookups, KB retrieval results keyed by query embedding hash, rate-limit
  counters. Explicit TTLs + event-driven invalidation on config change.
- **Read models for Analytics** so dashboards never aggregate over raw operational tables.
- **N+1 discipline** with Prisma; pagination mandatory on all list endpoints.
- Detailed budgets and techniques: [`PERFORMANCE_GUIDELINES.md`](PERFORMANCE_GUIDELINES.md).

---

## 14. Security Considerations

- **No public signup** (PRD): registration endpoints do not exist; orgs/users are created by
  platform admins + invitation tokens (short-lived, single-use, signed).
- **Secrets** in AWS Secrets Manager / SSM, never in env files in the image. Rotate provider keys.
- **Webhook authenticity:** verify Twilio signatures, WhatsApp/Meta `X-Hub-Signature-256`,
  Google signatures. Reject unsigned/replayed requests (timestamp + nonce).
- **PII everywhere:** names, phones, budgets, call recordings, transcripts. Encrypt at rest
  (RDS/S3 KMS), in transit (TLS). Recordings/transcripts are highly sensitive — tight S3
  bucket policies, signed URLs with short expiry, tenant-prefixed keys.
- **Tenant isolation = the #1 security property** (see §10). Add automated cross-tenant access
  tests to CI.
- **DPDP Act (India) / consent:** outbound calling + recording has legal/consent obligations
  (see [`PRD_REVIEW.md`](PRD_REVIEW.md) — flagged as a gap). Capture consent, support DNC/opt-out,
  honor data-subject deletion.
- **Least privilege** IAM for ECS tasks; separate roles per service.
- **Audit logging** of admin actions and cross-tenant access. Full checklist:
  [`SECURITY_GUIDELINES.md`](SECURITY_GUIDELINES.md).

---

## 15. Risks & Trade-offs (top architectural risks)

| Risk | Impact | Mitigation |
|---|---|---|
| **Voice latency/quality** doesn't hit "is it human?" bar | Core value prop fails | Dedicated voice-gateway, streaming pipeline, strict latency SLOs, fallback to human handoff |
| **Modular monolith boundaries erode** into a big ball of mud | Future service extraction impossible | Lint-enforced import boundaries, no cross-context table access, ADR discipline (Phase 4) |
| **Multi-tenant data leak** | Catastrophic / legal | Defense-in-depth (guard+middleware+RLS) + CI cross-tenant tests |
| **Third-party cost & rate limits** (OpenAI/Twilio/ElevenLabs/WhatsApp) | Cost blowup, throttling | Per-tenant rate limiting, caching, cost telemetry (CPL/ROAS), provider abstraction to swap vendors |
| **LLM nondeterminism / hallucination** giving wrong property/price info | Trust + legal | RAG grounding + citations, guardrails, confidence-based escalation, eval harness on KB answers |
| **Regional language + code-switching** quality | Core differentiator weak | Provider/model selection per language, eval datasets per language, human-review loop |
| **Compliance (consent/recording/DPDP)** under-specified in PRD | Legal exposure | Treat as MVP blocker for outbound; see PRD review |
| **Single Postgres as everything** (OLTP + vector + FTS) | Contention at scale | Read replica, monitor, documented extraction ramps |

Full living risk register: extend [`DECISION_LOG.md`](DECISION_LOG.md) as decisions are made.

---

## 16. Future Extensibility

The architecture is designed so the following are **additive, not rewrites**:

- **Extract a context to its own service** — boundaries already forbid cross-context coupling;
  swap the in-process call for gRPC/HTTP and the in-process bus for SNS/SQS or Kafka. Voice is
  the first candidate (already separate).
- **New channels** (Instagram DM, Telegram, SMS) — implement the Channel adapter port; the
  Conversation Engine and AI Employee are unchanged.
- **New verticals beyond real estate** — the templates engine + configurable
  qualification/pipeline/scoring means a "Healthcare" or "Auto" template is config + a new
  template pack, not a fork. Keep real-estate specifics in the *template/config layer*, not
  hard-coded in core domain.
- **Swap AI providers** — STT/LLM/TTS sit behind ports; add a provider adapter and route by
  language/cost/latency policy.
- **Public self-serve signup** (PRD says "not public initially") — IAM already separates
  platform vs tenant roles; add a registration flow + billing context later.
- **Billing & metering** — emit usage events now (calls, messages, tokens) even though
  there's no billing context yet, so a future Billing context can consume history.
- **New event consumers** — because side effects are events, adding (say) a Slack integration
  or a data-warehouse sink is a new subscriber, touching zero existing code.
