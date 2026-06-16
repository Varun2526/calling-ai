# ADR-0002: Build a modular monolith now, with hard context boundaries, not microservices

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Principal Architect, Engineering Lead
- **Tags:** architecture, boundaries, modularity, extraction

---

## Context

Propulse AI spans 14 bounded contexts ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §3, §2) — from
the core AI Employee "brain" to Notifications and Analytics. The textbook reflex for "many
contexts" is microservices. But this is a V1 built by a small team that must ship a working,
human-grade AI employee product fast, with tight conversation- and voice-latency budgets
([`ARCHITECTURE.md`](../ARCHITECTURE.md) §13).

Premature microservices would impose distributed-systems tax we cannot afford yet: network
hops on every cross-context call (hurting our < 2s text and < 1.2s voice turn budgets),
distributed transactions, per-service CI/CD and observability, and the cognitive load of
versioning N service APIs — all before we even know which seams will actually need
independent scaling. At the same time, a naive monolith risks decaying into a big ball of mud,
which would make future extraction impossible (a top risk in
[`ARCHITECTURE.md`](../ARCHITECTURE.md) §15). We need the *boundaries* of microservices without
the *operational cost*, and a concrete rule for when to pay that cost.

## Decision

**We will build a modular monolith: a single NestJS application (`apps/api`) with exactly one
module per bounded context, separated by hard, lint-enforced boundaries — and extract a context
into its own deployable service only when a specific trigger fires.**

The boundaries are designed in from day one so that extraction is *mechanical, not a rewrite*:

- **One context = one NestJS module = one schema namespace**, owning its tables exclusively
  ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §5, [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §3).
- **No cross-context imports of internals** and **no cross-context table access.** A context
  may import only another context's *published application interface* or its event/contract
  types — never its `domain/` or `infrastructure/`. This is enforced mechanically (ESLint
  boundaries, dependency-cruiser, CI greps), not by reviewer goodwill
  ([`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §5, [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §5).
- **Cross-context communication is exactly one of three kinds**: synchronous query via a
  published interface, synchronous command within one context's own transaction, or an
  asynchronous domain event for side effects ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §5, §7).
  Because side effects are already events ([ADR-0006](0006-event-bus-and-outbox.md)), swapping
  the in-process bus for SNS/SQS or Kafka touches subscribers' transport, not their logic.
- **IDs cross boundaries, not entities** ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §5).

**The rule for when we extract a context to its own service** — extract only when *at least
one* of these is true, and record it in an ADR:

1. **Divergent runtime profile.** A context needs a fundamentally different scaling/availability
   profile from the rest of the API. (Voice already meets this bar — it is split out from day
   one; see [ADR-0005](0005-voice-gateway-separation.md).)
2. **Independent scaling pressure.** A context's load (CPU, memory, queue depth) repeatedly
   forces us to scale the whole monolith just to serve it, wasting capacity.
3. **Fault isolation need.** A context's failures or deploys must not be allowed to affect
   others (e.g. a latency-critical or revenue-critical path).
4. **Team / ownership scaling.** An independent team needs an independent deploy cadence and
   release boundary.

Absent a trigger, we do **not** extract. "It feels cleaner as a service" is not a trigger.

## Consequences

- **Positive:**
  - Microservice-grade boundaries (each context isolated and extractable) with monolith-grade
    developer velocity and operational simplicity — one image, one pipeline, in-process calls
    that keep our latency budgets reachable.
  - Cross-context refactors and end-to-end debugging happen in one process with one stack trace.
  - Workers and `voice-gateway` reuse the same domain/application code via packages — domain
    logic has exactly one home ([`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §1, §5).
- **Negative / accepted trade-offs:**
  - The whole API scales as a unit until a context is extracted; one context can hog resources
    (mitigated by per-tenant/per-queue rate limiting, [`ARCHITECTURE.md`](../ARCHITECTURE.md) §12).
  - Boundary discipline is now a *standing cost*: the lint/dep-cruiser/CI rules must stay green,
    and any relaxation requires an ADR + a config change in the same PR.
  - A single process means a catastrophic bug can take down all synchronous contexts at once
    (mitigated by the queue/voice split absorbing the async- and latency-critical paths).
- **Follow-ups / obligations:**
  - Keep the architecture-fitness test (`architecture.spec.ts`) and `pnpm boundaries` in CI as
    the guardrail against erosion ([`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §5).
  - Each extraction is its own ADR citing which trigger fired.

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Microservices from day one** | Independent scale/deploy/fault isolation per context | Network hops blow latency budgets; distributed transactions; N pipelines + observability; premature before we know the real seams | ❌ rejected — distributed-systems tax with no V1 payoff |
| **Plain (unstructured) monolith** | Fastest to write initially | Boundaries erode into a big ball of mud; future extraction becomes a rewrite (a top §15 risk) | ❌ rejected — trades short-term speed for long-term lock-in |
| **Modular monolith with enforced boundaries + extract-on-trigger (chosen)** | Real, lint-enforced seams; monolith velocity; mechanical extraction later | Standing boundary-discipline cost; scales as a unit until extraction | ✅ **chosen** |

## Related

- Docs: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §0, §3, §5, §7, §16;
  [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §1, §3, §5;
  [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §5.
- ADRs: [ADR-0004](0004-monorepo-turborepo-pnpm.md) (the repo shape that houses the modules);
  [ADR-0005](0005-voice-gateway-separation.md) (the first context extracted, by trigger #1);
  [ADR-0006](0006-event-bus-and-outbox.md) (events make extraction mechanical).
