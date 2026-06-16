# ADR-0004: Use a Turborepo monorepo with pnpm workspaces

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Principal Architect, Platform team
- **Tags:** repo, tooling, monorepo, build

---

## Context

Propulse AI ships **four deployable units** — `apps/web` (Next.js dashboards), `apps/api` (the
NestJS modular monolith), `apps/voice-gateway`, and `apps/workers` — that must share a large
amount of code: the domain/application logic of each context (reused by api, workers, and
voice-gateway), DTO/event schemas, shared kernel value objects, the Prisma schema and tenant
middleware, the design system, config, and observability
([`ARCHITECTURE.md`](../ARCHITECTURE.md) §1, [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §2).

A multi-repo (polyrepo) approach would force this shared code into versioned, published
packages with cross-repo coordination on every change — exactly the friction we want to avoid
while the contracts and module boundaries are still moving. We need a single dependency graph,
atomic cross-cutting changes (e.g. change an event schema and every consumer in one PR), and
fast, cached, parallel builds/tests so CI stays quick as the repo grows. The choice must align
with the modular-monolith decision ([ADR-0002](0002-modular-monolith-over-microservices.md)):
workers and voice-gateway must *reuse* context code, never duplicate it.

## Decision

**We will use a single monorepo managed by Turborepo with pnpm workspaces, organized as
`apps/` (deployables) and `packages/` (libraries).**

- **pnpm** (not npm/yarn) for strict, content-addressed, fast installs and first-class
  workspace-protocol support ([`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §1).
- **Turborepo** for the task pipeline (`build` / `lint` / `test` / `typecheck` /
  `boundaries`) with caching and parallelism, configured in `turbo.json`.
- **Apps are deployables; packages are libraries.** The dependency direction is strict and
  one-way: **apps may depend on packages; packages never depend on apps**
  ([`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §1, §5 rule 4;
  [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §3 matrix). Packages avoid depending on
  each other except the explicit shared ones (`contracts`, `domain-kernel`, `database`, `ui`,
  `config`, `observability`, `eslint-config`, `tsconfig`, `testing`).
- **Shared compiler + lint baseline** via `tsconfig.base.json` / `packages/tsconfig` and
  `packages/eslint-config` (which carries the boundary/import rules from
  [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §5).
- The single graph lets us make **atomic cross-cutting changes** and run **boundary checks
  across the whole repo** in one CI invocation.

## Consequences

- **Positive:**
  - One install, one dependency graph; an event/contract change and all its consumers move in a
    single PR — no cross-repo version dance.
  - Turborepo caching + affected-task selection keep CI fast as the repo grows.
  - Workers and voice-gateway consume context packages directly, satisfying the
    "domain logic has exactly one home" rule ([`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §5 rule 7).
  - The repo layout *is* the architecture diagram — boundaries are visible and enforceable in
    one place.
- **Negative / accepted trade-offs:**
  - A monorepo needs discipline: without the boundary tooling, everything-imports-everything is
    easy — which is precisely why the lint/dep-cruiser rules are mandatory.
  - All teams share one CI pipeline and one toolchain version; a bad shared-config change can
    affect everyone (mitigated by CODEOWNERS review on shared packages).
  - pnpm's strictness occasionally surfaces peer-dependency issues that looser package managers
    hide; we treat that as a feature, not a bug.
- **Follow-ups / obligations:**
  - Keep `turbo.json` task graph and remote caching healthy as apps/packages are added.
  - Adding an app or package, or changing the module layout, requires updating
    [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) and an ADR if architecturally
    significant.

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Polyrepo (one repo per app/package)** | Hard isolation; independent versioning | Cross-repo coordination tax on every shared change; risk of code duplication across api/workers/voice | ❌ rejected — friction with no V1 benefit while boundaries are still settling |
| **Monorepo with npm/yarn workspaces** | Single graph, familiar | Slower/looser installs; weaker workspace-protocol and content-addressing than pnpm | ❌ rejected — pnpm is strictly better for our needs |
| **Nx** | Powerful generators/graph | Heavier conceptual surface than we need over NestJS/Next.js conventions | ❌ rejected — Turborepo's lighter task/cache model suffices |
| **Turborepo + pnpm workspaces (chosen)** | Fast cached parallel builds; strict installs; atomic changes; clean apps/packages split | Requires boundary discipline; shared toolchain | ✅ **chosen** |

## Related

- Docs: [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §1, §2, §4, §5;
  [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §3, §5; [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1.
- ADRs: [ADR-0002](0002-modular-monolith-over-microservices.md) (the monolith the repo houses);
  [ADR-0005](0005-voice-gateway-separation.md) (a separate app within the same monorepo).
