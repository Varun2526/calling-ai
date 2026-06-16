# Propulse AI — Feature Development Blueprint (Phase 7)

> **Purpose:** The single, mandatory process every feature follows from idea to "done in
> production". It turns our architecture (`ARCHITECTURE.md`), domain rules (`DOMAIN_RULES.md`),
> repository layout (`REPOSITORY_STRUCTURE.md`) and clean-architecture rules
> (`CLEAN_ARCHITECTURE.md`) into a repeatable checklist so that **any** engineer or AI agent
> ships features the same way, with the same boundaries, the same tenant safety, and the same
> quality bar.
>
> **Owner:** Engineering Leads (per-context owners in `CODEOWNERS` co-own the sections that
> touch their context). The blueprint document itself is owned by the Staff/Principal
> Engineering group.
>
> **Update frequency:** Reviewed every release train; amended whenever the architecture,
> domain model, or tooling changes (always paired with an ADR if the change is architecturally
> significant). The `feature-specs/_TEMPLATE.md` must stay in lock-step with the 14 sections
> defined here.

---

## 0. How to use this blueprint (and why it is mandatory)

Every feature — from a one-line copy change with domain impact up to a new bounded context —
**MUST** produce a feature spec by copying [`feature-specs/_TEMPLATE.md`](feature-specs/_TEMPLATE.md)
to `feature-specs/NNNN-short-slug.md` (4-digit, zero-padded, monotonically increasing). The
spec is reviewed and approved **before** implementation begins and is kept current through
delivery. A worked end-to-end example lives at
[`feature-specs/0001-inbound-lead-capture-whatsapp.md`](feature-specs/0001-inbound-lead-capture-whatsapp.md).

Why mandatory, not optional:

- **Boundaries erode silently.** The spec forces you to name the bounded context(s), the
  aggregates, and the events *before* you write code that quietly reaches across a boundary.
- **Tenant safety is non-negotiable.** The DB, infra, and testing sections force `organizationId`,
  RLS, tenant-scoped keys, and cross-tenant tests every single time.
- **Side effects must be events.** The event section forces you to declare facts emitted/consumed
  so we never reintroduce synchronous cross-context coupling.
- **Reviewability.** A reviewer can approve an approach from the spec in minutes instead of
  reverse-engineering it from a 2,000-line PR.

> **Rule:** No feature branch merges to `main` without an approved, up-to-date spec linked in
> the PR description. CI checks for a referenced `feature-specs/NNNN-*.md`. "It was just a small
> change" is not an exemption — if it has domain, data, API, event, or tenant impact, it needs
> a spec (a small feature simply has short sections, and may mark sections "N/A — <reason>").

**Spec lifecycle / status:** `Draft → In Review → Approved → In Progress → Shipped → Superseded`.
The frontmatter `status` field is the source of truth; update it as the feature moves.

---

## 1. The 14 required sections

Every spec contains **all 14** sections, in this order. A section may be marked
`N/A — <one-line reason>` but may never be deleted (a missing section reads as "forgotten",
an `N/A` reads as "considered and excluded"). For each section below: **what it is**,
**guidance**, and **what "good" looks like**.

---

### (1) Business requirement

**What:** The problem, the user, the value, and the measurable outcome — in business language,
not implementation language.

**Guidance:**
- State the *actor* (which PRD role: Sales Executive, Client Owner, buyer/prospect, platform
  Ops, AI Employee acting on behalf of the org) and the *job to be done*.
- Tie it to a product/PRD line item and to a metric it should move (e.g. response time, CPL,
  site-visit conversion, lead leakage).
- Note explicitly out-of-scope items so the boundary of the feature is unambiguous.

**Good looks like:** One paragraph a non-engineer signs off on, plus a short bullet list of
in-scope / out-of-scope, plus the target metric and its current baseline. No mention of tables,
endpoints, or queues.

---

### (2) Acceptance criteria (Gherkin-style)

**What:** Executable-style scenarios that define "done" behaviourally.

**Guidance:**
- Write `Scenario:` blocks in `Given / When / Then` (and `And`) form.
- Cover the happy path, the key alternate paths, and the failure/edge paths (timeouts,
  duplicates, opt-out, low AI confidence, missing data).
- **Always include at least one multi-tenant isolation scenario** (e.g. "a user from Org A can
  never see/act on Org B's data").
- Include latency-budget scenarios where relevant (text turn `< 2s p95`, voice turn `< 1.2s p95`).

**Good looks like:** Scenarios map 1:1 to e2e/integration tests in Section 10. Each is concrete
("a WhatsApp message from a new number") not vague ("the system works"). Negative and
cross-tenant cases are present, not just the sunny path.

---

### (3) Domain analysis

**What:** The DDD impact: which bounded context(s) own the change, which aggregates are touched,
new value objects, and the invariants that must hold.

**Guidance:**
- List the **owning context** and any **collaborating contexts** (with the relationship:
  upstream/downstream/customer-supplier per `ARCHITECTURE.md §3`).
- For each aggregate touched: name it, state whether it is created/mutated, and confirm a single
  transaction mutates exactly **one** aggregate instance (global invariant #3).
- Declare new/changed **value objects** (immutable, self-validating, equality-by-value).
- Restate the **invariants** and **never-violate rules** from `DOMAIN_RULES.md` that this
  feature must preserve, plus any new invariant it introduces.
- Confirm cross-aggregate / cross-context effects are expressed as **events**, not object refs
  (global invariant #2; only IDs cross boundaries).

**Good looks like:** A reader can tell exactly which `contexts/<c>/domain/` folders change and
why, with no hidden cross-context table coupling. New VOs are justified (why a primitive won't
do). Invariants are testable assertions, not prose.

---

### (4) Database changes

**What:** Prisma model changes, the migration, tenancy, indexes, and RLS.

**Guidance:**
- Describe Prisma model additions/changes in `packages/database` (new models, fields, enums,
  relations). Show the model sketch.
- **Every tenant-scoped model MUST include `organizationId`** and be registered with the tenant
  middleware (`REPOSITORY_STRUCTURE.md §5.6`). State this explicitly per model.
- Specify the **migration** name and whether it is **forward-only and reversible** (additive
  preferred; destructive changes need a two-step expand/contract plan).
- List **indexes** (always lead composite indexes with `organizationId`; add FTS/`pgvector`
  indexes where queried), and uniqueness constraints (often `@@unique([organizationId, ...])`).
- Specify the **RLS policy** for each new table (the `app.current_org` GUC predicate) — RLS is
  the backstop, not optional.
- Note partitioning intent for high-volume append tables (messages, transcripts, analytics).

**Good looks like:** Migration is additive and reversible; no table lacks `organizationId` or
RLS; every query pattern in Section 5/7 has a supporting index; uniqueness is tenant-scoped.

---

### (5) API contracts

**What:** The endpoints (REST/WS) and the **`packages/contracts`** zod schemas that define them.

**Guidance:**
- List each endpoint: method, path, auth/role (CASL `(action, subject)`), request/response
  shape, error model (RFC-7807 problem-details), pagination for lists.
- Define request/response DTOs and any shared enums/ids as **zod schemas in
  `packages/contracts`** — never hand-roll types in the app. Controllers validate with these.
- For WebSocket: name the channel/room (tenant-scoped room), the message envelope schema, and
  the events pushed.
- **Never expose a domain entity over the wire** — map to a response DTO (`CLEAN_ARCHITECTURE.md`
  Violation F).
- Update `docs/API_CONTRACTS.md` and reference it.

**Good looks like:** A frontend engineer can build against the contract before the backend
exists. Every list is paginated, every endpoint has explicit auth, every response is a DTO from
`contracts`, errors are problem-details.

---

### (6) Event definitions

**What:** New/changed domain events this feature emits or consumes, per the event catalog.

**Guidance:**
- Use the naming rule `<context>.<aggregate>.<pastTenseFact>.v<major>` — facts, past tense,
  immutable, versioned (`ARCHITECTURE.md §8`).
- For each **emitted** event: name, version, payload schema (zod in `packages/contracts`,
  IDs only — `organizationId` always present), the aggregate change it accompanies, and the
  fact it asserts. Confirm it is written to the **Outbox in the same transaction** as the
  aggregate change.
- For each **consumed** event: which context/handler reacts, and the idempotency key.
- For **changed** events: bump the major version and describe the dual-publish / consumer
  migration plan (back-compat — see Section 13).
- Register every event in [`EVENT_CATALOG.md`](EVENT_CATALOG.md) in the same PR.

**Good looks like:** Side effects are all events (no synchronous cross-context calls), payloads
carry IDs + `organizationId` only, every consumer is idempotent, versions are explicit, and the
catalog is updated.

---

### (7) Backend implementation plan (by layer)

**What:** The concrete plan, walked **domain → application → infrastructure → presentation**,
naming the exact folders from `REPOSITORY_STRUCTURE.md`.

**Guidance — respect the dependency rule (`CLEAN_ARCHITECTURE.md §1`); dependencies point inward:**
- **Domain** (`contexts/<c>/domain/`): new/changed entities, VOs, domain services, **port
  interfaces**, and domain events. Pure — zero `@nestjs`/Prisma/SDK/`process.env`.
- **Application** (`contexts/<c>/application/`): command/query/event handlers, the transaction +
  Outbox-write, use-case-level authorization. No SQL, no SDKs.
- **Infrastructure** (`contexts/<c>/infrastructure/`): Prisma repository impls, external
  adapters (LLM/WhatsApp/S3/etc.), mappers, queue producers. Implements ports; no business
  decisions.
- **Presentation** (`contexts/<c>/presentation/`): controllers/WS gateways validating with
  `contracts` zod, CASL policies. Body = validate → call use case → map DTO.
- Name **workers** (`apps/workers/src/processors/`) and **voice-gateway** reuse where async or
  realtime work is involved — they invoke application use cases, never duplicate domain logic.
- Wire everything only in the context `*.module.ts` (the composition root).

**Good looks like:** Each bullet names a real folder and file, the inward dependency direction
is obvious, ports are defined in domain and implemented in infra, and no cross-context internal
import appears.

---

### (8) Frontend implementation plan

**What:** The Next.js feature-first slice and the components/clients it uses.

**Guidance:**
- Name the route(s) under `apps/web/app/(client|admin)/...` and the feature slice under
  `apps/web/features/<feature>/` (components, hooks, feature **api-client**, zod schemas — the
  schemas re-used from `packages/contracts`).
- Compose UI from **`@propulse/ui`** primitives via `apps/web/components/`; do not reach into
  another feature's internals.
- Specify data fetching (server components/loaders vs client hooks), the **api-client** calls
  (typed by `contracts`), and any **WebSocket** subscription (tenant room, live updates such as
  new message / agent status / notification).
- Note loading/empty/error states and role-gating (which PRD roles see what).

**Good looks like:** A vertical slice that only imports its own internals + shared `ui`/`lib`,
is typed end-to-end from `contracts`, and renders live updates via the tenant-scoped WS room.

---

### (9) Infrastructure requirements

**What:** Queues, S3, Redis keys, third-party config, and IaC needed to run the feature.

**Guidance:**
- **Queues (BullMQ):** new queues/processors, concurrency, per-tenant rate limits, retry/backoff,
  DLQ. Every job payload carries `organizationId`.
- **S3:** buckets/prefixes — always tenant-prefixed `s3://bucket/org/{id}/...`; signed,
  short-lived URLs; KMS at rest.
- **Redis:** key patterns — always tenant-scoped `org:{id}:...`; TTLs and invalidation triggers;
  pub/sub channels for WS fan-out.
- **Third parties:** provider config (WhatsApp BSP, OpenAI, Deepgram, ElevenLabs, SES, Maps),
  secrets in Secrets Manager/SSM (never env files in image), webhook signature verification.
- **IaC (`infra/`):** ECS task/service changes, new env vars (declared in `.env.example` and
  validated via `packages/config`), alarms/dashboards, IAM least-privilege per task.

**Good looks like:** Every key/queue/object is tenant-scoped; every secret is in Secrets Manager;
every new env var is validated config; rate limits protect provider quotas and noisy neighbours.

---

### (10) Testing requirements

**What:** The test plan across levels, including the **mandatory cross-tenant test**.

**Guidance:**
- **Unit** (domain): pure tests of VOs, invariants, domain services, scoring/assignment — no
  mocks of frameworks.
- **Integration** (application + infra): use-case handlers against a real DB (testcontainers),
  repository impls, Outbox write, event handler idempotency.
- **Contract:** validate request/response and event payloads against `packages/contracts` zod
  schemas (provider/consumer).
- **E2E:** the Section-2 Gherkin scenarios driven through API/WS (and Playwright for UI).
- **Cross-tenant (MANDATORY):** prove Org A cannot read/act on Org B's data through this
  feature's endpoints, queues, cache keys, and S3 prefixes. This test is required even for
  "small" features (`ARCHITECTURE.md §14`).
- Note latency assertions where budgets apply.

**Good looks like:** Each acceptance scenario has a test; domain logic is unit-tested with no
I/O; there is an explicit, passing cross-tenant isolation test; idempotency of every event
handler is tested.

---

### (11) Documentation updates

**What:** Which `docs/` files change, and whether an ADR is required.

**Guidance:**
- List the docs to update: `EVENT_CATALOG.md` (any event change — required), `API_CONTRACTS.md`
  (any endpoint change), `DOMAIN_RULES.md` (new aggregate/VO/invariant), `REPOSITORY_STRUCTURE.md`
  (new module/folder), `ENGINEERING_STANDARDS.md`, runbooks (`runbooks/`) for new operational
  procedures, `TROUBLESHOOTING.md`.
- **Write an ADR** (`docs/adr/NNNN-*.md`, immutable/append-only) if the change is architecturally
  significant: a new bounded context, a boundary relaxation, a new third-party dependency, a
  tenancy/security change, or anything that edits `ARCHITECTURE.md`/`CLEAN_ARCHITECTURE.md`.
- Keep the feature spec itself current through delivery.

**Good looks like:** The PR updates every doc it invalidates; significant decisions have a linked
ADR; the event catalog and API contracts never drift from code.

---

### (12) Monitoring requirements

**What:** The observability to know the feature works and to debug it when it doesn't.

**Guidance:**
- **CloudWatch metrics:** business + technical counters/timers (e.g. messages processed, leads
  created, AI confidence distribution, turn latency p95), dimensioned by `organizationId` where
  cardinality allows.
- **Alarms:** thresholds tied to SLOs (latency budget breach, queue depth/age, DLQ > 0,
  error-rate, third-party failure rate). Route to the right on-call.
- **Sentry:** error capture with tenant + correlation/conversation id tags (never PII in tags).
- **Logs:** structured, correlation-id propagated, tenant-tagged, no secrets/PII in plaintext
  (`packages/observability`).
- **SLOs:** state the SLO (e.g. text turn `< 2s p95`, voice turn `< 1.2s p95`, notification
  delivered `< 30s p95`) and how it is measured.

**Good looks like:** Each acceptance/latency criterion is observable; alarms exist for every
failure mode in Section 2; dashboards are tenant-aware; the `WorkflowFailure`/escalation path is
itself alarmed (it must never be silently dropped).

---

### (13) Rollback strategy

**What:** How to turn it off / roll it back safely without data loss or stuck tenants.

**Guidance:**
- **Feature flag:** the feature ships behind a Platform-Ops feature flag (per-org where it makes
  sense), default-off, with a documented enable/disable procedure.
- **Migration reversibility:** the Section-4 migration is reversible, or follows expand/contract
  (deploy code tolerant of both shapes → migrate → cleanup) so rollback never strands data.
- **Backward-compatible events:** new events are additive; changed events are dual-published
  across the major bump until all consumers migrate; consumers ignore unknown fields. Never
  break an existing consumer.
- **Idempotency on replay:** because delivery is at-least-once, re-enabling after rollback must
  not double-apply (idempotency keys).
- State the blast radius and the explicit "kill switch" steps.

**Good looks like:** A clear, tested "disable in < 5 minutes" path; no irreversible destructive
migration in a single step; no event change that breaks an existing consumer.

---

### (14) Definition of Done

**What:** The binary checklist that gates merge/release.

**Guidance — the feature is Done only when ALL hold:**
- [ ] Spec approved and kept current; status set to `Shipped`.
- [ ] All acceptance scenarios (Section 2) implemented and passing as tests.
- [ ] Layer boundaries respected; `pnpm boundaries`, domain-purity grep, and
      `architecture.spec.ts` pass (`CLEAN_ARCHITECTURE.md §5`).
- [ ] Every tenant-scoped model has `organizationId` + tenant middleware + RLS; **cross-tenant
      isolation test passes**.
- [ ] Contracts/events registered in `packages/contracts`, `API_CONTRACTS.md`, `EVENT_CATALOG.md`.
- [ ] Unit/integration/contract/e2e/cross-tenant tests green in CI; coverage on new domain logic.
- [ ] Metrics, alarms, Sentry tags, structured logs, and SLOs in place (Section 12).
- [ ] Behind a feature flag; rollback + migration-reversibility verified (Section 13).
- [ ] Docs updated; ADR written if architecturally significant.
- [ ] Secrets in Secrets Manager; new env vars in `.env.example` + validated via `packages/config`.
- [ ] Latency budgets met where applicable (text `< 2s`, voice `< 1.2s`).
- [ ] PR reviewed by the owning context's CODEOWNERS (and an architect for any boundary change).

**Good looks like:** Nothing on this list is hand-waved; each box maps to evidence (a passing
CI job, a dashboard link, a flag entry).

---

## 2. Boundaries & anti-patterns (read before you code)

These are the failure modes the blueprint exists to prevent. They are **build failures**, not
style preferences (`CLEAN_ARCHITECTURE.md §5`).

**Do:**
- Keep `domain/` pure: no `@nestjs`, `@prisma`, `bullmq`, `ioredis`, `aws-sdk`, `axios`,
  `process.env`. Inject a clock port instead of `Date.now()` in business logic.
- Define ports in `domain/`; implement adapters in `infrastructure/`; wire in the module file.
- Cross a context boundary with **IDs and events only** — call the other context's *published*
  application interface for queries, emit an event for side effects.
- Carry `organizationId` on every row, cache key, queue job, S3 object, and vector query.
- Map domain aggregates to DTOs (`packages/contracts`) before returning over HTTP/WS.

**Never (anti-patterns — each maps to a `CLEAN_ARCHITECTURE.md` violation):**
- **No cross-context table access.** `contexts/campaign` must not `prisma.lead.findMany()` — that
  is CRM's table. Use CRM's published query or consume `crm.lead.created.v1` (Violation B).
- **No synchronous cross-context side-effect calls.** `CreateLead` must not call
  `notificationService.send()` — emit `crm.lead.created.v1`; Notifications subscribes
  (Violation D). The AI Employee never writes to CRM/Appointments tables — it emits
  `ActionIntent`s dispatched as commands/events (`DOMAIN_RULES.md` BC-1.AI).
- **No business logic in controllers** or in infrastructure adapters (Violations A, C).
- **No domain entity leaked over the wire** (Violation F).
- **No scattered `process.env`** — all env via `packages/config` (Violation E).
- **No multi-aggregate mutation in one transaction** — one aggregate per transaction;
  everything else is an event (global invariant #3).
- **No identity false-merge** — never merge two real people (`DOMAIN_RULES.md` BC-2: a missed
  merge beats a wrong merge).
- **No outreach to opted-out/DNC contacts**, and stop immediately on opt-out/convert
  (`DOMAIN_RULES.md` BC-4).

> The only way to relax a boundary is an ADR that updates the relevant doc **and** the lint
> config in the same PR.
