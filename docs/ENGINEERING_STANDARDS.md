# Propulse AI — Engineering Standards (Phase 6)

> **Purpose:** The single, opinionated rulebook for _how we write, name, branch, review, secure,
> and ship code_ at Propulse AI. This is the "how" layer on top of the architecture decisions in
> [`ARCHITECTURE.md`](ARCHITECTURE.md), [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md), and
> [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md). Those documents decide _what the system is_;
> this one decides _how every engineer and AI agent contributes to it_.
>
> **Owner:** Engineering Manager (with Staff Engineer as deputy).
> **Update frequency:** reviewed quarterly, plus on demand whenever a recurring review comment or
> a CI rule reveals a missing standard. Changes that contradict an architecture doc require an ADR.
> **Audience:** all engineers, contractors, and AI coding agents. Non-negotiable unless a rule
> here explicitly says "guideline".

This document is **Phase 6** of the PRD. It does **not** redefine architecture; where it touches
boundaries, multi-tenancy, events, or layering it _restates and operationalizes_ the canonical docs.

---

## Table of contents

1. [Naming conventions](#1-naming-conventions)
2. [Git strategy](#2-git-strategy)
3. [Pull request process](#3-pull-request-process)
4. [Commit standards](#4-commit-standards)
5. [Code review checklist](#5-code-review-checklist)
6. [Security checklist](#6-security-checklist)
7. [Performance checklist](#7-performance-checklist)
8. [Documentation checklist](#8-documentation-checklist)
9. [Testing checklist](#9-testing-checklist)
10. [Definition of Done](#10-definition-of-done)

---

## 1. Naming conventions

Naming is not bikeshedding here — names encode our boundaries. A misnamed event or queue leaks a
context's internals; a missing `organizationId` leaks a tenant's data. The rules below are
**enforced by lint, CI, and review**, not by goodwill.

### 1.1 Folders — `kebab-case`, always

Every directory in the repo is lowercase `kebab-case`. No exceptions, including bounded-context
module folders and feature slices.

| Good                                    | Bad                                    |
| --------------------------------------- | -------------------------------------- |
| `apps/api/src/contexts/knowledge-base/` | `apps/api/src/contexts/KnowledgeBase/` |
| `apps/web/features/ai-employee/`        | `apps/web/features/aiEmployee/`        |
| `docs/feature-specs/`                   | `docs/featureSpecs/`                   |
| `infrastructure/persistence/`           | `infrastructure/Persistence/`          |

Layer folders are fixed words: `domain/`, `application/`, `infrastructure/`, `presentation/`, and
inside them `entities/`, `value-objects/`, `events/`, `ports/`, `services/`, `commands/`,
`queries/`, `event-handlers/`, `dtos/`, `persistence/`, `adapters/`, `mappers/`, `controllers/`,
`gateways/`, `policies/`. Do not invent synonyms (`usecases/`, `repos/`, `dao/` are forbidden).

### 1.2 Files — by what they contain

The file name's casing follows the **primary export**, not the folder.

| File contains                                               | Casing                                                    | Example                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- |
| A class (entity, service, repository impl, NestJS provider) | `PascalCase.ts`                                           | `Lead.ts`, `AssignmentService.ts`, `PrismaLeadRepository.ts`     |
| A React component                                           | `PascalCase.tsx`                                          | `LeadTable.tsx`, `ConversationTimeline.tsx`                      |
| A NestJS controller / gateway / module                      | `<name>.<role>.ts` (Nest idiom)                           | `lead.controller.ts`, `crm.module.ts`, `conversation.gateway.ts` |
| A React hook                                                | `useXxx.ts`                                               | `useLeads.ts`, `useConversationSocket.ts`                        |
| zod schemas / contracts                                     | `kebab-case.ts`                                           | `create-lead.dto.ts`, `lead-created.event.ts`                    |
| Plain utilities / config / constants                        | `kebab-case.ts`                                           | `phone-utils.ts`, `rate-limits.ts`                               |
| Tests                                                       | mirror subject + `.spec.ts` / `.test.ts` / `.e2e-spec.ts` | `AssignmentService.spec.ts`, `leads.e2e-spec.ts`                 |
| Barrel                                                      | `index.ts`                                                | `index.ts`                                                       |

> We follow NestJS's `name.role.ts` convention for framework artefacts (controllers, modules,
> gateways, guards, interceptors) because the ecosystem and CLI expect it. **Pure class files**
> (domain entities, services, repository implementations) use `PascalCase.ts` so the file name
> equals the export. Pick the rule by which the file is — a domain `AssignmentService.ts` is a
> class; a `crm.module.ts` is a framework wiring file.

### 1.3 Classes & types — `PascalCase`, role-suffixed

| Kind                      | Rule                          | Example                                         |
| ------------------------- | ----------------------------- | ----------------------------------------------- |
| Aggregate root / entity   | Noun, no suffix               | `Lead`, `Contact`, `Conversation`, `AiEmployee` |
| Value object              | Noun, no suffix               | `PipelineStage`, `Budget`, `E164Phone`          |
| Domain service            | `<Concept>Service`            | `AssignmentService`, `ScoringEngine`            |
| Command handler           | `<Verb><Noun>Handler`         | `CreateLeadHandler`, `AssignLeadHandler`        |
| Query handler             | `<Get/List><Noun>Handler`     | `GetLeadHandler`, `ListLeadsHandler`            |
| Event handler             | `On<Event>Handler`            | `OnLeadCreatedHandler`                          |
| Repository implementation | `<Tech><Aggregate>Repository` | `PrismaLeadRepository`                          |
| Adapter                   | `<Vendor><Capability>Adapter` | `OpenAiLlmAdapter`, `TwilioVoiceAdapter`        |
| Mapper                    | `<Aggregate>Mapper`           | `LeadMapper`                                    |
| NestJS module             | `<Context>Module`             | `CrmModule`                                     |

### 1.4 Interfaces & ports — **no `I` prefix**, named by role

We do **not** prefix interfaces with `I`. A port is named for the _capability the domain needs_,
phrased as the role, not the technology. The implementation carries the technology in its name.

| Port (domain interface)  | Implementation (infrastructure)          |
| ------------------------ | ---------------------------------------- |
| `LeadRepository`         | `PrismaLeadRepository`                   |
| `EmbeddingProvider`      | `OpenAiEmbeddingProvider`                |
| `SpeechToTextProvider`   | `DeepgramSttAdapter`                     |
| `NotificationDispatcher` | `SesNotificationDispatcher`              |
| `Clock`                  | `SystemClock` (and `FakeClock` in tests) |
| `EventPublisher`         | `OutboxEventPublisher`                   |

Forbidden: `ILeadRepository`, `LeadRepositoryInterface`, `LeadRepositoryImpl`. If you feel the urge
to write `Impl`, the port is named after the technology instead of the role — rename the port.

### 1.5 DTOs — `*RequestDto` / `*ResponseDto`

DTOs live in `packages/contracts` (zod schemas + inferred types) and are the only shapes that cross
the wire. Domain entities are **never** serialized directly (see Clean Arch Violation F).

| Direction                     | Suffix         | Example                                              |
| ----------------------------- | -------------- | ---------------------------------------------------- |
| Inbound request body / params | `*RequestDto`  | `CreateLeadRequestDto`, `ListLeadsRequestDto`        |
| Outbound response payload     | `*ResponseDto` | `LeadResponseDto`, `ConversationTimelineResponseDto` |
| Nested/shared sub-shape       | `*Dto`         | `AddressDto`, `MoneyDto`                             |

```ts
// packages/contracts/src/crm/create-lead.dto.ts
export const CreateLeadRequestDto = z.object({
  contactId: z.string().uuid(),
  source: LeadSourceEnum,
  budget: MoneyDto.optional(),
});
export type CreateLeadRequestDto = z.infer<typeof CreateLeadRequestDto>;
```

### 1.6 Domain events — `<context>.<aggregate>.<pastTenseFact>.v<major>`

This is the canonical convention from [`ARCHITECTURE.md` §8](ARCHITECTURE.md) and the authoritative
registry is [`EVENT_CATALOG.md`](EVENT_CATALOG.md). Events are **facts** (past tense), immutable, and
versioned. Commands are imperative and never on the bus.

| Rule                               | Good                               | Bad                                               |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------- |
| Past tense fact                    | `crm.lead.created.v1`              | `crm.lead.create` (imperative — that's a command) |
| Lowercase, dot-delimited           | `calls.transcript.completed.v1`    | `Calls.Transcript.Completed`                      |
| Versioned with `.v<major>`         | `campaign.outreach.attempted.v1`   | `campaign.outreach.attempted` (unversioned)       |
| Context prefix = owning context    | `qualification.answer.captured.v1` | `lead.answer.captured.v1` (no owning context)     |
| Bump `v` on breaking schema change | `crm.lead.created.v2`              | mutating `v1`'s shape in place                    |

The TypeScript event class mirrors the name in `PascalCase` and lives in the owning context's
`domain/events/`: `LeadCreatedV1` carries the constant `eventName = 'crm.lead.created.v1'`.

### 1.7 BullMQ queues — `<context>.<job>`

Queues are namespaced by the owning context and the job they perform. One queue per logical job
type. Every job payload **must** carry `organizationId` (see [`ARCHITECTURE.md` §10](ARCHITECTURE.md)).

| Queue                   | Owning context | Purpose                            |
| ----------------------- | -------------- | ---------------------------------- |
| `kb.ingest`             | Knowledge Base | source ingestion (extract → chunk) |
| `kb.embed`              | Knowledge Base | embedding generation / re-index    |
| `calls.transcribe`      | Calls          | transcription finalization         |
| `calls.summarize`       | Calls          | AI summary + sentiment             |
| `campaign.dispatch`     | Campaign       | outbound outreach dispatch         |
| `campaign.followup`     | Campaign       | follow-up scheduling/firing        |
| `notifications.deliver` | Notifications  | multi-channel delivery             |
| `analytics.project`     | Analytics      | read-model projection              |
| `platform.outbox-relay` | Platform Ops   | drain outbox → bus                 |

Forbidden: `ingestQueue`, `emailQueue`, `jobs` (no context), `kb-ingest` (use `.` not `-` between
context and job — `kb.ingest`). Job _names_ within a queue, if any, are also `kebab-case`.

### 1.8 Database tables — `snake_case`, plural

Owned by `packages/database` (Prisma). Prisma **models** are `PascalCase` singular (`Lead`); the
mapped **table** is `snake_case` plural via `@@map`.

| Rule                                                | Example                                                |
| --------------------------------------------------- | ------------------------------------------------------ |
| Table = `snake_case` plural                         | `leads`, `contacts`, `pipeline_stages`, `ai_employees` |
| Column = `snake_case`                               | `created_at`, `pipeline_stage_id`                      |
| **Every tenant-scoped table has `organization_id`** | `leads.organization_id` (not null, indexed)            |
| Foreign key = `<entity>_id`                         | `contact_id`, `pipeline_stage_id`, `assigned_user_id`  |
| Join table = both entities, alpha order             | `lead_tags`, `campaign_segments`                       |
| Boolean = `is_`/`has_` prefix                       | `is_active`, `has_consent`                             |
| Timestamp = `_at` suffix                            | `created_at`, `qualified_at`, `deleted_at`             |
| Enum-backed status                                  | `status` (Prisma enum, not free text)                  |

```prisma
model Lead {
  id             String   @id @default(uuid())
  organizationId String   @map("organization_id")
  contactId      String   @map("contact_id")
  status         LeadStatus
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([organizationId])
  @@map("leads")
}
```

Tenant scoping per [`REPOSITORY_STRUCTURE.md` rule 6](REPOSITORY_STRUCTURE.md): a tenant-scoped model
without `organizationId` registered with the tenant middleware **fails the Prisma tenant lint**.

### 1.9 Environment variables — `SCREAMING_SNAKE_CASE`, prefixed by concern

All env access goes through `packages/config` (validated with zod) — never `process.env.X` scattered
in code (Clean Arch Violation E). Names are `SCREAMING_SNAKE_CASE` and prefixed by the concern/vendor.

| Concern       | Variable                                                           | Notes                    |
| ------------- | ------------------------------------------------------------------ | ------------------------ |
| Database      | `DATABASE_URL`, `DATABASE_READ_REPLICA_URL`                        | connection strings       |
| Redis         | `REDIS_URL`                                                        | cache + BullMQ + pub/sub |
| OpenAI        | `OPENAI_API_KEY`, `OPENAI_BASE_URL`                                | LLM/embeddings           |
| Deepgram      | `DEEPGRAM_API_KEY`                                                 | STT                      |
| ElevenLabs    | `ELEVENLABS_API_KEY`                                               | TTS                      |
| Twilio        | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WEBHOOK_SECRET` | voice/PSTN               |
| WhatsApp      | `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`                     | webhook signature        |
| AWS / S3      | `AWS_REGION`, `S3_BUCKET_RECORDINGS`, `S3_BUCKET_DOCUMENTS`        | storage                  |
| Auth          | `JWT_SECRET`, `SESSION_TTL_SECONDS`                                | sessions                 |
| Observability | `SENTRY_DSN`, `LOG_LEVEL`                                          | logging/tracing          |
| Runtime       | `NODE_ENV`, `PORT`, `APP_ENV` (`dev`/`staging`/`prod`)             |                          |

Every var is documented in `.env.example` (no secrets committed). Booleans are explicit
(`FEATURE_X_ENABLED=true`). No bare names like `KEY`, `URL`, `TOKEN`, `SECRET`.

---

## 2. Git strategy

**Trunk-based development with short-lived branches off `main`.** `main` is always releasable.
We rebase, not long-running feature branches; we do not maintain `develop`/GitFlow.

### 2.1 Branching

- Branch off the latest `main`. **Keep branches under ~2 days of work**; if it lives longer, it's
  too big — split it (see [PR size limits](#31-size-limits)).
- Rebase on `main` before opening the PR and before merge. Squash-merge into `main`.
- Branch names: `<type>/<ticket>-<kebab-slug>`.

| Type        | Use                   | Example                                        |
| ----------- | --------------------- | ---------------------------------------------- |
| `feat/`     | new capability        | `feat/PROP-412-lead-scoring-engine`            |
| `fix/`      | bug fix               | `fix/PROP-588-webhook-signature-replay`        |
| `chore/`    | tooling, deps, config | `chore/PROP-601-bump-prisma-5`                 |
| `refactor/` | no behavior change    | `refactor/PROP-377-extract-assignment-service` |
| `docs/`     | docs only             | `docs/PROP-640-event-catalog-campaign`         |
| `perf/`     | performance work      | `perf/PROP-655-cache-kb-retrieval`             |
| `test/`     | tests only            | `test/PROP-700-cross-tenant-isolation`         |

Always include the ticket id (Jira/Linear). Branches with no ticket are blocked by CI.

### 2.2 Protected `main`

`main` is a protected branch:

- **No direct pushes** (force-push, admin-bypass disabled).
- PR required; **CI must be green**; **≥1 approval including a CODEOWNER**; branch up to date with
  `main`; linear history (squash merge).
- Conversations must be resolved before merge.

### 2.3 Release & environment promotion

Tag-based releases, promoted forward through environments — never sideways or backward.

```
main ──squash──▶ (auto-deploy) dev ──promote──▶ staging ──promote──▶ prod
                                    └ tag vX.Y.Z      └ same artifact, gated
```

- **`dev`** auto-deploys on every merge to `main`.
- **`staging`** is promoted by tagging `vX.Y.Z` (semver). The _exact same built artifact_
  (Docker image digest) that was tested moves forward — we never rebuild between staging and prod.
- **`prod`** is promoted from a green `staging` via a gated GitHub Action (requires release-manager
  approval). Database migrations run as a separate, reviewed step before app rollout (expand/contract).
- **Changesets** (`@changesets/cli`) version the shared `packages/*` so apps consume pinned, changelogged
  versions. App deploys are tagged; package releases are changeset-driven.
- **Hotfix:** `fix/` branch off `main`, fast-tracked through the same pipeline (no skipping CI or staging
  smoke tests). Cherry-pick is not used — we roll forward.

---

## 3. Pull request process

### 3.1 Size limits

Smaller PRs are reviewed faster and more correctly. Guidance, enforced by a soft CI warning:

| Size                    | Net changed lines (excl. generated/lockfiles) | Expectation                                     |
| ----------------------- | --------------------------------------------- | ----------------------------------------------- |
| **Ideal**               | ≤ 250                                         | normal flow                                     |
| **Acceptable**          | 250–400                                       | reviewer may still merge                        |
| **Needs justification** | 400–800                                       | PR description must explain why it can't split  |
| **Blocked**             | > 800                                         | split it, or get EM sign-off recorded in the PR |

Generated Prisma client, migrations, and lockfiles are excluded from the count. A PR should do
**one thing**; mixing a refactor with a feature is a split signal.

### 3.2 Required CI gates (all must be green)

The PR cannot merge until every check passes — these mirror the enforcement in
[`CLEAN_ARCHITECTURE.md` §5](CLEAN_ARCHITECTURE.md):

| Check                         | Command           | What it guards                                                 |
| ----------------------------- | ----------------- | -------------------------------------------------------------- |
| Lint                          | `pnpm lint`       | style + `no-restricted-imports` boundary rules                 |
| Typecheck                     | `pnpm typecheck`  | TS project references, no `any` leaks                          |
| Unit/integration tests        | `pnpm test`       | correctness + cross-tenant isolation tests                     |
| **Boundaries**                | `pnpm boundaries` | `dependency-cruiser` + domain-purity grep + Prisma tenant lint |
| Build                         | `pnpm build`      | all apps build (Turborepo)                                     |
| e2e (on label/critical paths) | `pnpm test:e2e`   | end-to-end flows                                               |

A boundary violation is a **build failure, not a comment**.

### 3.3 Approval & linkage

- **≥1 approval, including the relevant CODEOWNER.** Touching a context's `domain/` requires that
  context owner; touching boundary configs requires an architect (per CODEOWNERS).
- The PR must link its ticket (CI checks for `PROP-####` in branch/title).
- Author does not approve their own PR or dismiss required reviews.

### 3.4 PR description template

```markdown
## What & why

<one paragraph: the change and the user/business reason>

Closes PROP-####

## How

<key implementation decisions; any new ports/events/queues introduced>

## Boundaries / architecture

- [ ] No cross-context internal imports; new cross-context flow is via event/published query
- [ ] domain/ stays pure (no framework/Prisma/env)
- [ ] New tenant-scoped tables have organization_id + tenant middleware

## Tests

<what you added: unit/integration/e2e/contract/cross-tenant; how to run>

## Docs

- [ ] ARCHITECTURE / EVENT_CATALOG / API_CONTRACTS / feature-spec / ADR updated as needed

## Screenshots / logs (if UI or behavior change)

## Rollout / migration notes

<expand-contract migration? feature flag? backfill?>
```

---

## 4. Commit standards

We use **[Conventional Commits](https://www.conventionalcommits.org/)**. The commit type +
optional scope drives changelog generation and signals intent. The scope is usually the bounded
context (`crm`, `voice`, `kb`, `campaign`, `iam`, `conversation`, `appointments`, etc.) or a
package (`contracts`, `ui`, `database`).

Format: `<type>(<scope>): <imperative summary>` — summary ≤ 72 chars, no trailing period.

| Type       | Use for                                   |
| ---------- | ----------------------------------------- |
| `feat`     | a new feature / capability (minor)        |
| `fix`      | a bug fix (patch)                         |
| `chore`    | tooling, deps, build, non-src maintenance |
| `docs`     | documentation only                        |
| `refactor` | code change with no behavior change       |
| `test`     | adding/adjusting tests only               |
| `perf`     | performance improvement                   |
| `build`    | build system / CI pipeline / packaging    |
| `ci`       | CI configuration only                     |
| `style`    | formatting only (no logic)                |
| `revert`   | reverting a previous commit               |

Breaking changes: append `!` after the type/scope **and** add a `BREAKING CHANGE:` footer, e.g.
`feat(contracts)!: rename LeadResponseDto.score → leadScore`.

### 4.1 Real examples

```text
feat(crm): add Lead aggregate with assignment invariants

fix(voice): verify Twilio signature before processing media webhook

chore(database): bump prisma to 5.18 and regenerate client

docs(events): document campaign.outreach.attempted.v1 in EVENT_CATALOG

refactor(qualification): extract ScoringEngine out of CreateLeadHandler

test(iam): add cross-tenant isolation test for ListLeads query

perf(kb): cache pgvector retrieval by query-embedding hash (TTL 5m)
```

### 4.2 AI-assisted commits

When a commit was authored with AI assistance, **the AI co-author footer is required** so authorship
is auditable:

```text
feat(campaign): add per-org rate limiting to outreach dispatch

Caps outbound dispatch per organizationId to protect WhatsApp/Twilio quotas
and prevent noisy-neighbor starvation.

Closes PROP-731
Co-Authored-By: Claude <noreply@anthropic.com>
```

The human author remains accountable for the change regardless of AI assistance.

---

## 5. Code review checklist

Reviewers verify _all_ of the following. Block on a "no"; nits are non-blocking suggestions
(prefix with `nit:`).

**Correctness**

- [ ] The code does what the ticket says; edge cases and empty/error states are handled.
- [ ] No dead code, no commented-out blocks, no leftover `console.log`/`TODO` without a ticket.
- [ ] Error handling is explicit; failures return typed results/Problem-Details, not swallowed.

**Boundaries & clean architecture** (per [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md))

- [ ] `domain/` is pure — no NestJS/Prisma/Redis/AWS/`process.env`/`Date.now`.
- [ ] No cross-context import of another context's `domain/`/`infrastructure/`.
- [ ] Cross-context side effects go through **events**, not direct service calls.
- [ ] Controllers validate → call use case → map to DTO; no business logic in presentation.
- [ ] New ports are role-named interfaces; implementations live in `infrastructure/`.

**Tenant scoping** (per [`ARCHITECTURE.md` §10](ARCHITECTURE.md))

- [ ] Every new tenant-scoped table/model has `organization_id` + tenant middleware registration.
- [ ] `organizationId` comes from the auth context, **never** from the request body.
- [ ] Redis keys (`org:{id}:…`), S3 prefixes (`org/{id}/…`), BullMQ payloads, pgvector filters all carry the tenant id.

**Tests**

- [ ] New behavior has tests at the right level (see [§9](#9-testing-checklist)).
- [ ] Cross-tenant isolation test exists for new data access paths.

**Security** — see [§6](#6-security-checklist). **Performance** — see [§7](#7-performance-checklist).

**Docs**

- [ ] New event/queue/endpoint reflected in EVENT_CATALOG / API_CONTRACTS; ADR added if a decision changed.

---

## 6. Security checklist

Tenant isolation is the **#1 security property** ([`ARCHITECTURE.md` §14](ARCHITECTURE.md)).

- [ ] **Tenant isolation:** data access is scoped by the request's `organizationId` from auth; the
      cross-tenant test passes; no query/cache/queue/S3 path can be addressed without the tenant id.
- [ ] **Authorization:** every sensitive route has a CASL policy (`(action, subject)`), not an ad-hoc
      `if (role === …)`. Resource-ownership rules (e.g. "assigned-to-me") expressed as policy conditions.
      Platform-vs-tenant role boundary respected; cross-tenant admin paths are explicit and audited.
- [ ] **Input validation:** all inbound payloads validated with **zod** schemas from
      `packages/contracts` at the controller boundary. No trusting client-supplied ids/roles/org.
- [ ] **Secrets:** no secrets in code, env files in the image, or logs. Read via `packages/config`
      from AWS Secrets Manager/SSM. New provider keys added to `.env.example` (name only) + Secrets Manager.
- [ ] **PII handling:** names/phones/budgets/recordings/transcripts encrypted at rest (KMS) and in
      transit (TLS). S3 access via short-expiry signed URLs with tenant-prefixed keys. Honor consent/DNC/
      data-subject deletion (DPDP).
- [ ] **Webhook signature verification:** Twilio signature, WhatsApp/Meta `X-Hub-Signature-256`,
      Google signatures verified **before** any processing. Reject unsigned/replayed (timestamp + nonce).
- [ ] **No secrets/PII in logs:** structured logging redacts tokens, keys, phone numbers, recording
      URLs. No full request bodies for PII-bearing endpoints.
- [ ] **Least privilege:** ECS task roles scoped to only what the service needs.

---

## 7. Performance checklist

Latency budgets are product-critical ([`ARCHITECTURE.md` §13](ARCHITECTURE.md)).

- [ ] **Pagination:** every list endpoint is paginated (cursor preferred); no unbounded `findMany`.
- [ ] **No N+1:** Prisma queries use `include`/`select` or batched loads; verified on representative data.
- [ ] **Caching:** hot reads (org config, AI-employee config, resolved identity, KB retrieval) cached in
      Redis with an **explicit TTL** _and_ an **invalidation path** (event-driven on config change). No cache
      without a documented invalidation strategy.
- [ ] **Latency budgets respected:** text conversation webhook→AI reply **< 2s p95**; voice end-to-end
      turn **< 1.2s p95** (stream STT partials → start LLM on partials → stream TTS). New synchronous work on
      these paths must justify its budget cost.
- [ ] **Queue the slow work:** anything hitting a variable-latency third party, retryable, or not needed to
      render the current screen is a **BullMQ job**, not inline. Per-queue concurrency + per-org rate limiting
      protect provider quotas and prevent noisy neighbors.
- [ ] **Analytics reads from read models**, never aggregating over raw operational tables.
- [ ] Appropriate indexes exist (esp. `organization_id` and FK columns); large appends stay partition-ready.

---

## 8. Documentation checklist

Docs are source of truth ([`REPOSITORY_STRUCTURE.md` §2](REPOSITORY_STRUCTURE.md)). Update the
relevant artefact **in the same PR** as the change:

- [ ] **ARCHITECTURE.md** — if a subsystem, boundary, or communication pattern changed.
- [ ] **EVENT_CATALOG.md** — for any new/changed/versioned domain event (and a new `.v2` on breaking change).
- [ ] **API_CONTRACTS.md** — for any new/changed REST/WS endpoint or DTO shape.
- [ ] **Feature spec** (`docs/feature-specs/`) — created from the blueprint for any non-trivial feature.
- [ ] **ADR** (`docs/adr/`) — for any architecturally significant decision or any change that relaxes a
      boundary rule (the ADR and the lint-config change ship in the same PR).
- [ ] **`.env.example`** — for any new env var. **README/ONBOARDING** — if setup/run steps changed.
- [ ] Public functions/ports have concise doc comments; the _why_ lives in code/ADR, not the PR thread.

---

## 9. Testing checklist

Test at the level that matches what you're protecting. The domain's purity is what makes fast,
mock-free unit tests possible.

| Level                      | Tests what                                                           | Where                                                         | Notes                                                                         |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Unit**                   | domain purity — entities, VOs, domain services, invariants, scoring  | `*.spec.ts` next to source                                    | No DB, no network, no framework. Inject `FakeClock`. Fast.                    |
| **Integration**            | repositories & adapters against real Postgres/Redis                  | `apps/api/test/`                                              | Prisma repos hit a test DB; verify mapping + RLS behavior.                    |
| **e2e**                    | full flows through HTTP/WS (inbound message → AI reply → CRM upsert) | `apps/api/test/*.e2e-spec.ts`, `apps/web/tests/` (Playwright) | Spin app + deps via docker-compose.                                           |
| **Contract**               | producer/consumer agreement on events & API DTOs                     | `packages/contracts` + per-context                            | Event schema in catalog matches emitted payload; DTOs match API.              |
| **Cross-tenant isolation** | tenant A cannot read/write tenant B                                  | per data-access path                                          | **Mandatory** for every new query/command; org-B principal gets 0 rows / 403. |

Checklist:

- [ ] New domain logic has unit tests covering invariants and edge cases.
- [ ] New repository/adapter has an integration test (incl. RLS).
- [ ] New user-facing flow has an e2e test.
- [ ] New/changed event or DTO has a contract test.
- [ ] **Every new tenant-scoped access path has a cross-tenant isolation test.**
- [ ] Tests are deterministic (no real time/network); flaky tests are quarantined with a ticket, not ignored.

---

## 10. Definition of Done

A change is **Done** only when _all_ of the following are true. This is the master gate — reviewers
and authors check it before merge.

- [ ] Acceptance criteria in the linked ticket are met; scope wasn't gold-plated.
- [ ] Branch named `<type>/PROP-####-slug`; commits follow Conventional Commits (AI co-author footer if AI-assisted).
- [ ] PR within size budget (or justified); description template filled; ticket linked.
- [ ] **All CI green:** lint, typecheck, test, **boundaries**, build (+ e2e where applicable).
- [ ] **Boundaries respected:** domain pure, no cross-context internals, side effects via events, DTOs at the wire.
- [ ] **Tenant isolation verified** with a cross-tenant test; `organizationId` from auth, present on all new tables/keys/jobs/prefixes.
- [ ] **Security checklist** passed (authz policies, zod validation, secrets, PII, webhook signatures, clean logs).
- [ ] **Performance checklist** passed (pagination, no N+1, cache TTL+invalidation, latency budgets, slow work queued).
- [ ] **Tests** at the right levels added and passing; no new flakes.
- [ ] **Docs updated** (ARCHITECTURE/EVENT_CATALOG/API_CONTRACTS/feature-spec/ADR/.env.example/README as needed).
- [ ] **≥1 approval including CODEOWNER**; all conversations resolved; branch rebased on `main`.
- [ ] Rollout considered: migrations are expand-contract, feature-flagged if risky, observable (logs/metrics/Sentry), and rollback is understood.
- [ ] Deployed to `dev` and verified (smoke) before promotion.
