# Propulse AI — Clean Architecture Rules (Phase 4)

> **Owner:** Principal Architect · **Update frequency:** rarely (these are load-bearing rules);
> any change needs an ADR. Enforced by ESLint boundaries, dependency-cruiser, and CI checks.

---

## 1. The dependency rule (the one rule)

> **Source-code dependencies point inward, toward the domain. Nothing in an inner layer knows
> anything about an outer layer.**

```
        ┌─────────────────────────────────────────────┐
        │            PRESENTATION (outer)              │  controllers, WS gateways, Next.js
        │   ┌─────────────────────────────────────┐    │
        │   │          APPLICATION                │    │  use cases, command/query/event handlers
        │   │   ┌─────────────────────────────┐   │    │
        │   │   │         DOMAIN (inner)      │   │    │  entities, VOs, domain services, ports
        │   │   │   pure, no dependencies     │   │    │
        │   │   └─────────────────────────────┘   │    │
        │   └─────────────────────────────────────┘    │
        └─────────────────────────────────────────────┘
                 ▲
        INFRASTRUCTURE implements the domain's PORTS (Dependency Inversion).
        It sits "outside" but is wired in at the composition root (the module file).
```

Inner layers define **interfaces (ports)**; outer layers provide **implementations
(adapters)**. The domain says "I need a `LeadRepository`"; infrastructure provides
`PrismaLeadRepository`. The arrow of _dependency_ points inward even though the arrow of
_control_ (calls) flows outward at runtime — that inversion is the whole point.

---

## 2. Layer responsibilities

### Domain layer (innermost — the "what is true")

- **Owns:** entities, aggregate roots, value objects, domain services, domain events, business
  invariants, and **port interfaces** (repositories, gateways the domain needs).
- **Responsibilities:** enforce business rules and invariants; be the single source of truth
  for "what is valid". 100% pure, deterministic, unit-testable with no mocks of frameworks.
- **Knows about:** `packages/domain-kernel` and its own context only.
- **Must be:** free of NestJS, Prisma, HTTP, Redis, BullMQ, AWS SDK, `process.env`, `Date.now`
  in business logic (inject a clock port), and any I/O.

### Application layer (use cases — the "what the system does")

- **Owns:** command handlers, query handlers, event handlers, transaction orchestration,
  application DTOs, the **Outbox-write** decision.
- **Responsibilities:** orchestrate domain objects to fulfill a use case; begin/commit the
  transaction; call ports; emit domain events (to the outbox); enforce authorization at the
  use-case level. Contains _no business rules_ (those are in domain) and _no I/O details_
  (those are behind ports).
- **Knows about:** domain (its own context) + `contracts` + other contexts' **published
  application interfaces/contracts** (never their domain/infra).

### Infrastructure layer (adapters — the "how, technically")

- **Owns:** Prisma repository implementations, external-service adapters (Twilio, OpenAI,
  Deepgram, ElevenLabs, WhatsApp, S3, SES, Maps), cache adapters, queue producers, mappers
  (domain ↔ persistence), the outbox relay.
- **Responsibilities:** implement domain/application **ports**; translate between the domain
  model and external representations; handle retries/timeouts/circuit-breaking for third parties.
- **Knows about:** domain (to implement its ports) + the SDKs/clients it wraps. **Contains no
  business decisions** — if an adapter has an `if` that decides business outcome, it's misplaced.

### Presentation layer (delivery — the "how it's exposed")

- **Owns (backend):** REST controllers, WebSocket gateways, request validation (zod from
  `contracts`), route-level authorization policies, HTTP problem-details mapping.
- **Owns (frontend):** Next.js routes/pages, React components, feature slices, the API client.
- **Responsibilities:** translate transport ↔ application use cases; never contain business
  logic or persistence. A controller's body should be: validate → call use case → map result.
- **Knows about:** application layer + `contracts`. Never imports domain entities directly into
  HTTP responses (map through DTOs).

---

## 3. Allowed vs forbidden dependencies (matrix)

| From ↓ / May import → | domain-kernel | own domain       | own application | own infra | other ctx contracts | other ctx app iface | other ctx domain/infra | `@nestjs`/SDKs   | Prisma          |
| --------------------- | ------------- | ---------------- | --------------- | --------- | ------------------- | ------------------- | ---------------------- | ---------------- | --------------- |
| **domain**            | ✅            | ✅               | ❌              | ❌        | ❌                  | ❌                  | ❌                     | ❌               | ❌              |
| **application**       | ✅            | ✅               | ✅              | ❌        | ✅                  | ✅                  | ❌                     | ⚠️ DI types only | ❌              |
| **infrastructure**    | ✅            | ✅               | ✅              | ✅        | ✅                  | ❌                  | ❌                     | ✅               | ✅              |
| **presentation**      | ✅            | ❌ (map via DTO) | ✅              | ❌        | ✅                  | ❌                  | ❌                     | ✅               | ❌              |
| **packages/**         | varies        | —                | —               | —         | —                   | —                   | ❌ apps                | varies           | only `database` |

Legend: ✅ allowed · ❌ forbidden (CI fails) · ⚠️ allowed only for framework DI plumbing, not logic.

---

## 4. Examples of violations (and the fix)

**Violation A — domain importing infrastructure**

```
// contexts/crm/domain/services/AssignmentService.ts
import { PrismaService } from '@nestjs/prisma';   // ❌ domain knows Prisma
```

_Fix:_ domain depends on a `LeadRepository` **port** (interface) it defines; `PrismaService`
lives only in `infrastructure/persistence/PrismaLeadRepository.ts` which implements that port.

**Violation B — cross-context table access**

```
// contexts/campaign/infrastructure/...
const leads = await prisma.lead.findMany(...);   // ❌ campaign reading CRM's table
```

_Fix:_ call CRM's published `ListLeadsForSegment` application query, or consume
`crm.lead.created.v1` to build a campaign-side read model. Campaign never touches CRM tables.

**Violation C — business logic in a controller**

```
// presentation/controllers/LeadController.ts
if (lead.budget > 10000000) lead.category = 'Hot';   // ❌ scoring rule in presentation
```

_Fix:_ the rule belongs to the `ScoringEngine` in the Lead Qualification domain. Controller
just calls the use case.

**Violation D — side effect via direct service call**

```
// application/commands/CreateLead.ts
await this.notificationService.send(...);   // ❌ synchronous cross-context coupling
```

_Fix:_ emit `crm.lead.created.v1` to the outbox; the Notifications context subscribes. CRM
doesn't know Notifications exists.

**Violation E — env access deep in code**

```
const key = process.env.OPENAI_API_KEY;   // ❌ scattered, unvalidated
```

_Fix:_ inject validated config from `packages/config`.

**Violation F — leaking a domain entity over HTTP**

```
return lead;   // ❌ exposes internal aggregate shape + invariants to the wire
```

_Fix:_ map to a `LeadResponseDto` defined in `packages/contracts`.

---

## 5. Enforcement (tooling, not goodwill)

Rules that depend on reviewer vigilance rot. We enforce mechanically:

1. **ESLint `no-restricted-imports` + `eslint-plugin-boundaries`** — declare each folder's
   layer/element type and the allowed import targets. PR fails on violation.
2. **`dependency-cruiser`** — a `depcruise` rule set encoding the §3 matrix + "no cross-context
   internals" + "no cycles". Runs in CI (`pnpm boundaries`).
3. **Domain-purity CI grep** — fail if any `**/domain/**` file imports `@nestjs`, `@prisma`,
   `bullmq`, `ioredis`, `aws-sdk`, `axios`, or references `process.env`.
4. **TypeScript project references** — `domain` packages don't even have framework types in
   scope; structurally hard to import what isn't there.
5. **Prisma tenant lint** — a custom check that every tenant-scoped model is registered with
   the tenant middleware and has `organizationId`.
6. **CODEOWNERS** — each context's `domain/` requires its owner's review; boundary configs
   require an architect's review.
7. **Architecture fitness test** — an automated test (`architecture.spec.ts`) asserting layer
   dependencies, run in CI alongside unit tests.

A violation is a **build failure**, not a comment. The only way to relax a boundary is an ADR
that updates this document _and_ the lint config in the same PR.
