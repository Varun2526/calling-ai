# Propulse AI — Onboarding Guide

> **Purpose:** Get any engineer or AI agent from zero to a running local stack and a first merged change in **~30 minutes**.
> **Owner:** Platform team · **Update frequency:** whenever setup steps, ports, prerequisites, or the docs index change.
> **Audience:** new engineers and AI agents.

> **Repo status:** This repository is currently at the **documentation stage** (Phases 1–5 docs exist; app code is being scaffolded against this canon). The setup commands below are the **intended, canonical commands** — they match the layout decided in [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) and [ARCHITECTURE.md](ARCHITECTURE.md). If a file or script isn't present yet, treat this guide as the spec for how it must work.

---

## 1. Read these 5 docs, in this order

Do this before touching code. ~20 minutes of reading saves days of rework.

| #   | Doc                                                | Why / what you'll learn                                                                                                              |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md)         | What we're building and why — AI employees, the two value loops, the module map, the glossary.                                       |
| 2   | [ARCHITECTURE.md](ARCHITECTURE.md)                 | The three non-negotiable invariants (tenant isolation, pure domain core, side-effects-as-events), modular monolith, multi-tenancy.   |
| 3   | [DOMAIN_RULES.md](DOMAIN_RULES.md)                 | Ubiquitous language + invariants. Internalize **Contact ≠ Lead**, scoring, assignment, escalation.                                   |
| 4   | [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) | Where everything lives; the per-directory charter; the hard rules that protect boundaries.                                           |
| 5   | [CLEAN_ARCHITECTURE.md](CLEAN_ARCHITECTURE.md)     | The layering inside a context (`presentation → application → domain`, `infrastructure → domain`) and the lint rules that enforce it. |

> AI agents: also read [AI_AGENT_GUIDELINES.md](AI_AGENT_GUIDELINES.md) before generating code.

## 2. Local dev setup

### 2.1 Prerequisites

| Tool                        | Version / source                                                   | Notes                                                        |
| --------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| **Node.js**                 | Pinned in **`.nvmrc`** / `.node-version` (repo root)               | `nvm use` to match exactly. Do not float.                    |
| **pnpm**                    | Workspace package manager (not npm/yarn)                           | `corepack enable && corepack prepare pnpm@latest --activate` |
| **Docker + Docker Compose** | For local infra (Postgres+pgvector, Redis, Mailhog, LocalStack/S3) | Docker Desktop or equivalent.                                |
| **Turborepo**               | Used via `pnpm` scripts                                            | No global install needed; runs through workspace.            |

```bash
# from the repo root
nvm use                 # picks up .nvmrc
corepack enable
pnpm install            # installs the whole workspace (single dependency graph)
```

### 2.2 Start local infrastructure

`docker-compose.yml` is **local-only** and provisions everything the app talks to so you never need cloud creds to develop:

```bash
docker-compose up -d    # postgres+pgvector, redis, mailhog, localstack (S3)
```

| Service                 | Local role                | Stand-in for (prod)       |
| ----------------------- | ------------------------- | ------------------------- |
| **postgres + pgvector** | OLTP + FTS + vector store | AWS RDS PostgreSQL        |
| **redis**               | cache · pub/sub · BullMQ  | Redis / ElastiCache       |
| **mailhog**             | catches outbound email    | AWS SES                   |
| **localstack**          | local S3                  | AWS S3 (recordings, docs) |

### 2.3 Environment

All env access goes through `packages/config` (validated with zod) — **never** scattered `process.env`. Every variable is documented in **`.env.example`**.

```bash
cp .env.example .env    # then fill in any local values; secrets stay out of git
```

### 2.4 Database: migrate + seed

Prisma schema, migrations, RLS policies, and seeds live in **`packages/database`**:

```bash
pnpm db:migrate         # apply Prisma migrations (creates schema + RLS policies)
pnpm db:seed            # seed an org, template, users, sample leads/conversations
```

> Tenant isolation is enforced in depth — app guard → Prisma tenant middleware → Postgres RLS. Seed data is scoped to a sample `organizationId`; every model you touch must carry it.

### 2.5 Run the apps

One command runs the whole stack through Turbo (cached + parallel):

```bash
pnpm dev                # turbo run dev across all apps
```

Or run a single app:

```bash
pnpm --filter @propulse/web dev
pnpm --filter @propulse/api dev
```

**Ports per app** (intended defaults; confirm in `.env.example`):

| App                  | Purpose                                  | Default port |
| -------------------- | ---------------------------------------- | ------------ |
| `apps/web`           | Next.js dashboards (client + admin)      | **3000**     |
| `apps/api`           | NestJS REST + WebSocket gateway          | **3001**     |
| `apps/voice-gateway` | Realtime voice/media sessions            | **3002**     |
| `apps/workers`       | BullMQ processors (no HTTP; queue-bound) | n/a          |

### 2.6 Verify your setup

```bash
pnpm lint && pnpm typecheck && pnpm test    # all via turbo
```

Open `http://localhost:3000` (dashboard) and check `apps/api` health on `:3001`. Mail lands in Mailhog's UI.

## 3. Repo tour

Full detail (and the per-directory charter + hard rules) is in [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md). The shape:

```
calling-ai/
├── apps/        # deployables
│   ├── web/             # Next.js — client dashboard + super-admin console (feature-first UI)
│   ├── api/             # NestJS modular monolith — ONE module per bounded context
│   ├── voice-gateway/   # realtime voice (long-lived STT↔LLM↔TTS sessions)
│   └── workers/         # BullMQ processors (one image, many queue process types)
├── packages/    # libraries (apps depend on packages; packages NEVER depend on apps)
│   ├── contracts/       # shared zod DTO/event/enum types — no logic, no I/O
│   ├── domain-kernel/   # shared VOs: OrganizationId, Money, E164Phone, Result, base classes
│   ├── database/        # Prisma schema, migrations, RLS, tenant middleware, seeds
│   ├── ui/              # shadcn/ui design system
│   ├── config/          # validated env loaders (the ONLY place env is read)
│   ├── observability/   # logger, tracing, Sentry, metrics
│   ├── eslint-config/   # shared lint incl. boundary/import rules
│   └── testing/         # shared test utils, tenant test harness
├── infra/       # Dockerfiles, ECS defs, Terraform/CDK, deploy scripts
└── docs/        # the documentation system — source of truth (you are here)
```

**Inside `apps/api/src/contexts/<context>/`** every module follows the same Clean Architecture layout:

```
<context>/
├── <context>.module.ts   # the ONLY file that knows infra wiring
├── domain/               # PURE: entities, value-objects, events, services, ports (no NestJS/Prisma/I/O)
├── application/          # use cases: commands, queries, event-handlers, dtos
├── infrastructure/       # implements ports: Prisma repos, external adapters, mappers
└── presentation/         # controllers, WS gateways, CASL policies
```

## 4. How to find the owner of code

Ownership maps to bounded contexts and lives in the root **`CODEOWNERS`** file. To find who owns a path:

```bash
# show the CODEOWNERS rules
git show :CODEOWNERS 2>/dev/null || cat CODEOWNERS
```

GitHub auto-requests the matching owner as reviewer on any PR touching their context. If you're changing `contexts/crm/`, the CRM context owner reviews; cross-cutting `shared/` and `packages/database` are owned by Platform. `docs/` is owned per-CODEOWNERS by the relevant teams.

## 5. Your first change

Use the **[FEATURE_BLUEPRINT.md](FEATURE_BLUEPRINT.md)** — it's the canonical recipe for adding any feature end-to-end without breaking boundaries. Walkthrough:

1. **Spec it.** Copy the blueprint template into `docs/feature-specs/<your-feature>.md`. State the bounded context it belongs to and which events it emits/consumes.
2. **Start in the domain (pure).** Add entities/value-objects/domain services in `contexts/<c>/domain/`. No NestJS, no Prisma — unit-testable with zero network. Write the test first ([test-driven-development] is encouraged).
3. **Add the use case.** A command/query handler in `application/`. Orchestrates the domain; depends on **ports**, not infrastructure.
4. **Implement infrastructure.** A Prisma repository (in `packages/database` + context `infrastructure/`) implementing the port. Ensure the model carries `organizationId` and is registered with the tenant middleware.
5. **Expose it.** A controller/gateway in `presentation/` with a CASL policy. Reuse shared DTO/event types from `packages/contracts` — do not redefine them.
6. **Side effects = events.** If your change triggers work in another context, **emit a domain event** (`<context>.<aggregate>.<pastTense>.v1`) via the Outbox — never call the other context's service inline or touch its tables. See [EVENT_CATALOG.md](EVENT_CATALOG.md) and [ARCHITECTURE.md §8](ARCHITECTURE.md).
7. **Wire the worker (if async).** Add/extend a processor in `apps/workers` that invokes the application use case — no new business logic in the worker.
8. **Frontend (if UI).** Add a vertical slice under `apps/web/features/<feature>/` (components, hooks, api-client, zod schemas). Reuse `@propulse/ui` primitives.
9. **Verify.** `pnpm lint && pnpm typecheck && pnpm test`. The boundary-check CI step must pass — it fails the build on cross-context imports, `domain/` importing infra, or `packages/` importing `apps/`.
10. **Open a PR.** CODEOWNERS routes review. Follow [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md).

**The rules you will trip over first (memorize these):**

- No cross-context imports of internals; talk via published app interfaces or events.
- No context reads another context's Prisma tables.
- `domain/` imports nothing framework/infra (CI greps for `@nestjs`/`@prisma`/`axios`/`bullmq`/`redis`/`aws-sdk`).
- Every tenant-scoped model has `organizationId`.

## 6. Where to get help — key docs index

| Topic                        | Doc                                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Product & vision             | [PRODUCT_OVERVIEW.md](PRODUCT_OVERVIEW.md) · [prd/CALLING_AI_V1.md](prd/CALLING_AI_V1.md)                      |
| Architecture & multi-tenancy | [ARCHITECTURE.md](ARCHITECTURE.md) · [adr/](adr/)                                                              |
| Domain language & rules      | [DOMAIN_RULES.md](DOMAIN_RULES.md)                                                                             |
| Code layout & boundaries     | [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) · [CLEAN_ARCHITECTURE.md](CLEAN_ARCHITECTURE.md)            |
| Adding a feature             | [FEATURE_BLUEPRINT.md](FEATURE_BLUEPRINT.md) · [feature-specs/](feature-specs/)                                |
| API & events                 | [API_CONTRACTS.md](API_CONTRACTS.md) · [EVENT_CATALOG.md](EVENT_CATALOG.md)                                    |
| Standards & AI agents        | [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md) · [AI_AGENT_GUIDELINES.md](AI_AGENT_GUIDELINES.md)        |
| Deploy / ops / debugging     | [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) · [runbooks/](runbooks/) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) |
| Security & performance       | [SECURITY_GUIDELINES.md](SECURITY_GUIDELINES.md) · [PERFORMANCE_GUIDELINES.md](PERFORMANCE_GUIDELINES.md)      |
| What's shipping              | [ROADMAP.md](ROADMAP.md) · [DECISION_LOG.md](DECISION_LOG.md)                                                  |
| People                       | Root `CODEOWNERS` (who owns what)                                                                              |

## 7. The 30-minute checklist

| ⏱     | Step                                                                                         | Done when                                                       |
| ----- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 0–5   | Skim the [5 docs](#1-read-these-5-docs-in-this-order) (deep-read later)                      | You can explain "AI employees, not chatbots" and Contact ≠ Lead |
| 5–8   | `nvm use` → `corepack enable` → `pnpm install`                                               | Install completes clean                                         |
| 8–11  | `docker-compose up -d`                                                                       | Postgres, Redis, Mailhog, LocalStack all healthy                |
| 11–13 | `cp .env.example .env` and fill locals                                                       | App boots without missing-env errors                            |
| 13–16 | `pnpm db:migrate && pnpm db:seed`                                                            | Schema + RLS applied; sample org seeded                         |
| 16–20 | `pnpm dev`                                                                                   | web :3000, api :3001, voice-gateway :3002, workers running      |
| 20–23 | Open dashboard :3000; check api health :3001; open Mailhog                                   | Pages render; health green                                      |
| 23–26 | `pnpm lint && pnpm typecheck && pnpm test`                                                   | All green (incl. boundary check)                                |
| 26–30 | Find your context's owner in `CODEOWNERS`; open [FEATURE_BLUEPRINT.md](FEATURE_BLUEPRINT.md) | You know where your first change goes and who reviews it        |

Welcome aboard — build AI employees, not chatbots.
