# Propulse AI — AI Agent & Contributor Guidelines

> **Owner:** Principal Architect · **Update frequency:** whenever the architecture, boundaries,
> or workflow change (with an ADR if significant) · **Audience:** AI coding agents (Claude,
> Cursor, etc.) **and** the human developers who work with them.

This is the operating manual for *changing this codebase correctly*. If you are an AI agent,
read it as hard constraints: the rules below are enforced by CI, so violating them produces a
**build failure**, not a review comment. If you are a human, read it as the contract you and
your AI pair are both held to.

---

## 1. Orient fast — read in this order

Don't start editing until you can place your task in the architecture. Read **only what your
task needs**, in this order:

1. [`PRODUCT_OVERVIEW.md`](PRODUCT_OVERVIEW.md) — what the product is (human-like AI voice/chat
   employees for real estate: lead capture, qualification, campaigns, site visits).
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — **the canonical doc.** Start at §0 (the three
   non-negotiable invariants) and §3 (bounded contexts). Skim the rest, return as needed.
3. [`DOMAIN_RULES.md`](DOMAIN_RULES.md) — find your bounded context; read its aggregates,
   invariants, and **never-violate** rules before touching its domain.
4. [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) — where code goes (§3 layered layout,
   §4 per-directory charter).
5. [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) — the dependency rules (§3 matrix, §4
   violations + fixes).
6. The relevant **ADR(s)** in [`adr/`](adr/) for *why* the design is the way it is, and
   [`DECISION_LOG.md`](DECISION_LOG.md) for the index + risk register.
7. Reference docs as needed: [`API_CONTRACTS.md`](API_CONTRACTS.md),
   [`EVENT_CATALOG.md`](EVENT_CATALOG.md), [`FEATURE_BLUEPRINT.md`](FEATURE_BLUEPRINT.md),
   [`SECURITY_GUIDELINES.md`](SECURITY_GUIDELINES.md),
   [`PERFORMANCE_GUIDELINES.md`](PERFORMANCE_GUIDELINES.md),
   [`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md).

**Heuristic:** before writing code, you should be able to name (a) which **bounded context**
you're in, (b) which **layer** (domain / application / infrastructure / presentation), and
(c) which **invariants** apply. If you can't, you're not ready to edit.

---

## 2. The non-negotiable invariants

These come straight from [`ARCHITECTURE.md`](ARCHITECTURE.md) §0 and
[`DOMAIN_RULES.md`](DOMAIN_RULES.md). They are not style preferences.

1. **Tenant isolation is sacred.** Every row, cache key, queue job, S3 object, and vector is
   scoped to an `organizationId`. There is **no** code path that reads tenant data without a
   tenant context. `organizationId` comes from the *authenticated session*, never from a
   request body. Enforced in depth: app guard → Prisma middleware → Postgres RLS
   ([ADR-0001](adr/0001-multi-tenancy-shared-schema-rls.md)). Every aggregate's
   `organizationId` is set at creation and **never changes**.
2. **The domain core imports no infrastructure.** Twilio, OpenAI, Prisma, BullMQ, Redis, S3,
   `process.env`, and even `Date.now` are details behind ports. Anything in a `domain/` folder
   must be unit-testable with zero network and zero framework. A CI grep enforces this
   ([`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §5).
3. **Side effects are events, not inline calls.** Crossing a context boundary as a side effect
   means *emit a domain event to the outbox* — never call another context's service to make
   something happen. CRM emits `crm.lead.created.v1`; it does not call Notifications
   ([ADR-0006](adr/0006-event-bus-and-outbox.md);
   [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §4 Violation D).
4. **No cross-context table access.** One context's Prisma tables are private. Context B never
   `SELECT`s or `JOIN`s context A's tables — it calls A's published application query or
   consumes A's events ([`ARCHITECTURE.md`](ARCHITECTURE.md) §5;
   [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §4 Violation B). **IDs cross boundaries, not
   entities.**

When in doubt, re-derive your change from these four. Most "where should this go?" questions
answer themselves once you do.

---

## 3. Where code goes

Follow the layered layout in [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) §3 and the
per-directory charter in §4. The shape of a bounded-context module
(`apps/api/src/contexts/<context>/`):

- **`domain/`** — entities, value objects, domain services, domain events, **port interfaces**.
  Pure. No `@nestjs`, no Prisma, no I/O, no `process.env`.
- **`application/`** — command/query/event handlers, transaction orchestration, the
  **outbox-write decision**, use-case-level authorization. Depends on domain (+ contracts +
  other contexts' *published* app interfaces). No SQL, no SDK calls.
- **`infrastructure/`** — Prisma repository implementations, third-party adapters, mappers, the
  outbox relay. Implements the domain's ports. **No business decisions.**
- **`presentation/`** — REST controllers, WS gateways, route-level CASL policies. A controller
  body is: *validate (zod from contracts) → call use case → map result to a DTO*. No business
  logic, no persistence.

Dependency direction (CI-enforced): `presentation → application → domain`, and
`infrastructure → domain` (implements its ports). Nothing imports inward from outside. See the
allowed/forbidden matrix in [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §3.

Shared code lives in `packages/` (`contracts`, `domain-kernel`, `database`, `ui`, `config`,
`observability`, `testing`); **packages never import apps**
([ADR-0004](adr/0004-monorepo-turborepo-pnpm.md)). Workers and voice-gateway **reuse** context
application code — they do not duplicate domain logic.

**Naming conventions:** follow [`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md) for
file/symbol naming, and the event-naming rule
`<context>.<aggregate>.<pastTenseFact>.v<major>` (§5 below). Use the ubiquitous language from
[`DOMAIN_RULES.md`](DOMAIN_RULES.md) §4 / [`ARCHITECTURE.md`](ARCHITECTURE.md) §4 — a Contact is
not a Lead, a Conversation is not a Call. Names are part of the contract.

---

## 4. How to add a feature

Use [`FEATURE_BLUEPRINT.md`](FEATURE_BLUEPRINT.md). The standard path:

1. **Place it.** Identify the owning bounded context (one feature usually lives in one context;
   if it seems to span two, the side effects across them are events, not shared code).
2. **Write the feature spec** from the blueprint template into `docs/feature-specs/`.
3. **Model the domain first** — entities/VOs/invariants in `domain/`, with unit tests, before
   any framework or DB code. The domain should compile and pass tests with no infra.
4. **Define ports** the domain needs; implement them in `infrastructure/`.
5. **Write use cases** in `application/`; decide which **events** you emit (to the outbox) and
   which you **consume**.
6. **Expose it** in `presentation/`: controllers/gateways validating against
   [`API_CONTRACTS.md`](API_CONTRACTS.md) DTOs, guarded by CASL policies
   ([ADR-0003](adr/0003-rbac-casl-policy-layer.md)).
7. **Wire it** in the context's `*.module.ts` (the only place that knows infra wiring).
8. **Keep real-estate specifics in config/templates**, not the core domain (see §6).

---

## 5. How to add or change events and API

**Events** ([ADR-0006](adr/0006-event-bus-and-outbox.md)):

- Events are **past-tense, immutable, versioned facts**, named
  `<context>.<aggregate>.<pastTenseFact>.v<major>` (e.g. `crm.lead.created.v1`). Commands are
  imperative and are **not** on the bus.
- Register every new/changed event in [`EVENT_CATALOG.md`](EVENT_CATALOG.md) **and** define its
  schema in `packages/contracts`, **in the same PR**. The catalog and the schema must never
  drift.
- Emit by writing to the **outbox in the same transaction** as the state change. Consumers are
  **idempotent** handlers in `apps/workers` (at-least-once delivery → dedupe by event id).
- Breaking a payload shape = bump `v<major>` and add a new event; do not mutate an existing
  event's meaning.

**API** ([`API_CONTRACTS.md`](API_CONTRACTS.md)):

- Define request/response **DTOs as zod schemas in `packages/contracts`**; controllers validate
  against them and map domain results to DTOs (never return a domain entity over the wire —
  [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §4 Violation F).
- All list endpoints are paginated; enforce tenant scope and CASL authorization at the edge.
- Update `API_CONTRACTS.md` in the same PR as the endpoint change.

---

## 6. The "do NOT" list

Each of these is a real failure mode mapped to an enforcement rule. Don't do them — and if you
see one, fix it (or flag it):

- **Don't bypass tenant scoping.** No reading/writing tenant data without the tenant context;
  no taking `organizationId` from the request body; no unregistered tenant-scoped Prisma model.
  The super-admin bypass is *only* the audited platform path
  ([ADR-0001](adr/0001-multi-tenancy-shared-schema-rls.md)).
- **Don't import another context's `domain/` or `infrastructure/`.** Only its published
  application interface or its contract/event types
  ([`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §3; [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) §5).
- **Don't put business logic in controllers** (or any presentation code). Validate → call use
  case → map. Scoring, pipeline transitions, assignment rules belong in the domain
  ([`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §4 Violation C).
- **Don't add new business logic only in workers.** Workers *invoke* application use cases;
  domain logic has exactly one home, in `contexts/` ([`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) §4, §5 rule 7).
- **Don't hardcode real-estate specifics into the core domain.** Pipeline stages, qualification
  questions, scoring weights, follow-up rules are **config/template data**, not code — so new
  verticals are a template pack, not a fork ([`DOMAIN_RULES.md`](DOMAIN_RULES.md)
  "Separation-of-concerns" #1; [`ARCHITECTURE.md`](ARCHITECTURE.md) §16).
- **Don't read `process.env` directly.** All env access goes through `packages/config`
  (validated) ([`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §4 Violation E;
  [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) §5 rule 5).
- **Don't cause cross-context side effects with a direct call.** Emit an event
  ([`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §4 Violation D).
- **Don't `Date.now()` or generate randomness inside domain logic** — inject a clock/id port so
  the domain stays deterministic and testable ([`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §2).
- **Don't return a domain entity over HTTP.** Map to a DTO from `packages/contracts`.

---

## 7. Testing & verification — before you claim "done"

"Done" means *verified*, not *written*. Before you say a task is complete:

- **Domain logic has unit tests** with no mocks of frameworks (the domain is pure, so this is
  cheap). New invariants get tests that assert them.
- **Run the full local gate and paste the result** — do not assert success you haven't
  observed:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm boundaries` (dependency-cruiser — the §3 matrix + no-cross-context-internals + no
    cycles; [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) §5)
  - `pnpm test` (unit + integration, including the **architecture-fitness test** and the
    **cross-tenant isolation tests**)
- **Tenant-isolation tests** must cover any new tenant-scoped model/path (tenant A cannot reach
  tenant B). This is the regression net for our #1 security property.
- If you touched events: a consumer test proving **idempotency** (replaying the event twice is
  a no-op the second time).
- If your change affects latency-sensitive paths (voice/conversation), sanity-check against the
  budgets in [`PERFORMANCE_GUIDELINES.md`](PERFORMANCE_GUIDELINES.md) (< 2s p95 text, < 1.2s p95
  voice turn).

A green CI is the bar. A violation is a build failure; the only way to relax a boundary is an
ADR that updates the rule doc **and** the lint config in the same PR.

---

## 8. Pull requests, commits, and ADRs

**PRs:**

- **Keep diffs small and single-purpose.** One feature/fix per PR; refactors separate from
  behavior changes.
- **Update docs in the same PR** as the code: event → `EVENT_CATALOG.md` + `contracts`; API →
  `API_CONTRACTS.md`; new module/app → `REPOSITORY_STRUCTURE.md`; significant decision → an ADR
  + a row in `DECISION_LOG.md`.
- PR description states: the bounded context(s) touched, the invariants relevant to the change,
  events added/changed, and the verification output (§7).
- Respect **CODEOWNERS**: a context's `domain/` needs its owner's review; boundary configs need
  an architect's review.

**Conventional Commits** ([`ENGINEERING_STANDARDS.md`](ENGINEERING_STANDARDS.md) is
authoritative): `type(scope): subject` — e.g. `feat(crm): add lead reassignment use case`,
`fix(voice): prevent dropped session losing call record`, `docs(adr): add ADR-0007 ...`. Scope
is usually the bounded context. End every commit message with the footer:

```
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```

**When to write an ADR** — write one when the decision is architecturally significant: it
changes a boundary or invariant, the tech stack, the data/tenancy model, the security posture,
the event/contract contracts, or anything other teams must build around. Process:
[`DECISION_LOG.md`](DECISION_LOG.md) "Adding a decision" → copy
[`adr/_TEMPLATE.md`](adr/_TEMPLATE.md), fill it, add the index row, in the same PR. To reverse a
decision, *supersede* it with a new ADR; never edit an accepted one's substance.

---

## 9. Prompt & context tips (for AI agents specifically)

- **Cite file paths.** When you propose or make a change, name the exact files and the layer
  (e.g. "add the rule to `contexts/qualification/domain/services/ScoringEngine.ts`"). Vague
  edits are how invariants get violated.
- **Pull the right context into your window**: the owning context's section in
  `DOMAIN_RULES.md`, the §3 layout, and the relevant ADR — not the whole repo. Reading too
  little causes boundary violations; reading everything wastes budget. Use §1's heuristic.
- **State your placement before editing**: "context = CRM, layer = application, invariants =
  every active Lead is assigned + no duplicate Contact." This catches misplacements before they
  hit code.
- **Keep diffs small and reversible.** Prefer the smallest change that satisfies the task; do
  not gold-plate or refactor unrelated code in the same diff.
- **Update docs in the same change.** Treat `EVENT_CATALOG.md`, `API_CONTRACTS.md`, the ADRs,
  and `DECISION_LOG.md` as part of the code — out-of-date docs are bugs.
- **Verify before claiming done** (§7). Run the gate; paste output; never report success you
  did not observe.
- **When uncertain about a boundary, stop and ask / flag** rather than guessing. A wrong
  cross-context coupling is expensive to unwind. If you spot an out-of-scope issue (dead code, a
  stale doc, a latent tenant-scope gap), flag it separately instead of bloating the current
  change.
- **Don't invent infrastructure.** Use the ports and packages that exist (`packages/config`,
  `packages/database`, the event bus/outbox). If a port is missing, define the interface in
  `domain/` and implement it in `infrastructure/` — don't reach for an SDK from the domain.
