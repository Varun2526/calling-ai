# Propulse AI — Repository Structure (Phase 3)

> **Owner:** Principal Architect + Platform team · **Update frequency:** when adding an
> app/package or changing the module layout (with an ADR). Decisions here are enforced by
> tooling — see [`CLEAN_ARCHITECTURE.md`](CLEAN_ARCHITECTURE.md) for the lint rules.

---

## 1. Top-level decisions

- **Monorepo with Turborepo + pnpm workspaces.** One repo, multiple deployables, shared
  packages, single dependency graph, cached/parallel task running. ([ADR-0004](adr/0004-monorepo-turborepo-pnpm.md))
- **pnpm** (not npm/yarn) for strict, content-addressed, fast installs and proper workspace
  protocol support.
- **Apps are deployables; packages are libraries.** Apps may depend on packages; packages
  **never** depend on apps. Packages avoid depending on each other except the explicit shared
  ones below.
- **The backend (`apps/api`) is a modular monolith**: one NestJS app, one module per bounded
  context, hard boundaries between modules (Phase 4). Workers and voice-gateway reuse the same
  domain/application code via packages — they do **not** duplicate it.

```
WHY this shape: it gives microservice-grade boundaries (each context is isolated and
extractable) with monolith-grade developer velocity and operational simplicity. The seams
are real (enforced by lint), so extraction later is mechanical, not a rewrite.
```

---

## 2. The repository tree

```
calling-ai/
├── README.md                      # 5-minute orientation; links into /docs
├── package.json                   # root scripts only; workspaces via pnpm-workspace.yaml
├── pnpm-workspace.yaml
├── turbo.json                     # task pipeline (build/lint/test/typecheck) + caching
├── tsconfig.base.json             # shared compiler options; apps/packages extend this
├── .nvmrc / .node-version
├── .env.example                   # every env var documented (no secrets)
├── .editorconfig
├── docker-compose.yml             # LOCAL ONLY: postgres+pgvector, redis, mailhog, localstack(S3)
├── CODEOWNERS                     # per-context ownership (maps to bounded contexts)
│
├── .github/
│   └── workflows/                 # CI: lint, typecheck, test, build, boundary-check, deploy
│
├── docs/                          # THE documentation system (Phase 5) — source of truth
│   ├── ARCHITECTURE.md   DOMAIN_RULES.md   REPOSITORY_STRUCTURE.md   CLEAN_ARCHITECTURE.md
│   ├── PRODUCT_OVERVIEW.md   DECISION_LOG.md   API_CONTRACTS.md   EVENT_CATALOG.md
│   ├── AI_AGENT_GUIDELINES.md   ONBOARDING_GUIDE.md   ENGINEERING_STANDARDS.md
│   ├── DEPLOYMENT_GUIDE.md   TROUBLESHOOTING.md   SECURITY_GUIDELINES.md
│   ├── PERFORMANCE_GUIDELINES.md   FEATURE_BLUEPRINT.md   ROADMAP.md   PRD_REVIEW.md
│   ├── prd/                       # source PRD (business source of truth, never edited for intent)
│   ├── adr/                       # Architecture Decision Records (immutable, append-only)
│   ├── feature-specs/             # one folder/file per feature, from the blueprint template
│   └── runbooks/                  # operational runbooks (incident response, ops procedures)
│
├── apps/
│   ├── web/                       # Next.js — client dashboard + super-admin console
│   │   ├── app/                   # App Router. Route groups by audience & feature.
│   │   │   ├── (client)/          #   tenant-facing dashboard
│   │   │   │   ├── dashboard/  leads/  conversations/  calls/  appointments/
│   │   │   │   ├── campaigns/  analytics/  documents/  settings/
│   │   │   ├── (admin)/           #   super-admin / ops console
│   │   │   │   ├── organizations/  users/  campaigns/  calls/  leads/  agents/
│   │   │   │   ├── analytics/  audit-logs/  system-health/  settings/
│   │   │   ├── (auth)/            #   invitation-accept, login, session (NO public signup)
│   │   │   └── api/               #   route handlers ONLY for BFF/proxy concerns, not domain logic
│   │   ├── features/              # FEATURE-FIRST: vertical slices of UI
│   │   │   ├── leads/             #   components, hooks, api-client, schemas for the Leads feature
│   │   │   ├── conversations/  calls/  campaigns/  appointments/  knowledge-base/
│   │   │   ├── ai-employee/  analytics/  onboarding/  organization/
│   │   ├── components/            # shared, feature-agnostic UI (composition of @propulse/ui)
│   │   ├── lib/                   # client utils, api client factory, ws client, auth helpers
│   │   ├── hooks/                 # cross-feature hooks
│   │   ├── styles/                # tailwind globals
│   │   └── tests/                 # component + e2e (Playwright) tests
│   │
│   ├── api/                       # NestJS — REST + WebSocket gateway; the modular monolith
│   │   ├── src/
│   │   │   ├── main.ts            # bootstrap (composition root)
│   │   │   ├── app.module.ts      # wires all context modules + shared infra modules
│   │   │   ├── contexts/          # ONE MODULE PER BOUNDED CONTEXT (see §3 layered layout)
│   │   │   │   ├── iam/
│   │   │   │   ├── organization/
│   │   │   │   ├── knowledge-base/
│   │   │   │   ├── ai-employee/
│   │   │   │   ├── conversation/
│   │   │   │   ├── channels/
│   │   │   │   ├── voice/          # call lifecycle domain (live loop runs in voice-gateway)
│   │   │   │   ├── calls/          # recordings/transcripts/summaries
│   │   │   │   ├── crm/
│   │   │   │   ├── qualification/
│   │   │   │   ├── campaign/
│   │   │   │   ├── appointments/
│   │   │   │   ├── notifications/
│   │   │   │   ├── analytics/
│   │   │   │   └── platform-ops/
│   │   │   ├── shared/            # cross-cutting (in-app only): tenant context, guards,
│   │   │   │   │                  #   interceptors, event-bus, outbox, problem-details filter
│   │   │   └── config/            # env schema validation, module config
│   │   └── test/                  # e2e + integration tests
│   │
│   ├── voice-gateway/             # NestJS — long-lived realtime voice/media sessions
│   │   └── src/                   # consumes @propulse/contexts-voice + ai-employee app services
│   │
│   └── workers/                   # BullMQ processors (one image, multiple queue process types)
│       └── src/processors/        # ingestion, embedding, transcription, summary, campaign,
│                                  #   follow-up, notifications, analytics-projection, outbox-relay
│
├── packages/
│   ├── contracts/                 # SHARED TYPES ONLY: API DTO schemas (zod), event schemas,
│   │                              #   shared enums/ids. The cross-app contract. No logic.
│   ├── domain-kernel/             # shared kernel VOs: OrganizationId, Money, E164Phone, Email,
│   │                              #   Result/Either, base Entity/AggregateRoot, DomainEvent base
│   ├── database/                  # Prisma schema, migrations, generated client, RLS policies,
│   │                              #   seed scripts, repository base + tenant middleware
│   ├── ui/                        # shadcn/ui-based design system (Button, DataTable, etc.)
│   ├── config/                    # shared runtime config loaders + env validation (zod)
│   ├── observability/             # logger, tracing, Sentry init, metric helpers (shared)
│   ├── eslint-config/             # shared ESLint incl. boundary/import rules (Phase 4)
│   ├── tsconfig/                  # shared tsconfig presets
│   └── testing/                   # shared test utils, fixtures, tenant test harness
│
└── infra/
    ├── docker/                    # Dockerfiles per app (multi-stage)
    ├── ecs/                       # ECS Fargate task/service definitions (IaC: CDK or Terraform)
    ├── terraform/ (or cdk/)       # RDS, ElastiCache, S3, ALB, IAM roles, secrets, networking
    └── scripts/                   # deploy, migrate, smoke-test scripts
```

---

## 3. Inside a bounded-context module (the canonical layout)

Every `apps/api/src/contexts/<context>/` follows Clean Architecture layering. Example: `crm`.

```
crm/
├── crm.module.ts                  # NestJS wiring; the ONLY file that knows infra wiring
├── domain/                        # PURE. No NestJS, no Prisma, no I/O.
│   ├── entities/                  #   Lead, Contact, Pipeline (aggregate roots + entities)
│   ├── value-objects/             #   PipelineStage, LeadSource, Budget, ...
│   ├── events/                    #   crm.lead.created.v1, ... (domain event classes)
│   ├── services/                  #   AssignmentService, PipelineService (pure domain logic)
│   └── ports/                     #   Repository INTERFACES, AnalyticsPort, etc.
├── application/                   # Use cases / orchestration. Depends on domain only.
│   ├── commands/                  #   CreateLead, AssignLead, ChangeStage (handlers)
│   ├── queries/                   #   GetLead, ListLeads (read use cases)
│   ├── event-handlers/            #   reacts to events from other contexts
│   └── dtos/                      #   application-level DTOs (re-export contracts schemas)
├── infrastructure/                # Implements ports. Knows Prisma/Redis/3rd parties.
│   ├── persistence/               #   PrismaLeadRepository implements LeadRepository
│   ├── adapters/                  #   external service adapters
│   └── mappers/                   #   domain <-> persistence mapping
└── presentation/                  # HTTP/WS surface. Depends on application only.
    ├── controllers/               #   REST controllers
    ├── gateways/                  #   WebSocket gateways (if any)
    └── policies/                  #   route-level authorization (CASL abilities)
```

Dependency direction (enforced): `presentation → application → domain` and
`infrastructure → domain` (implements its ports). Nothing imports inward from outside.

---

## 4. Per-directory charter (purpose / ownership / belongs / forbidden)

| Directory | Purpose | Owner | Belongs here | NEVER here |
|---|---|---|---|---|
| `apps/web/app/` | Routing & pages (Next App Router) | Frontend | Route groups, layouts, server components, loaders | Business rules, direct DB access, domain logic |
| `apps/web/features/<f>/` | Vertical UI slice per feature | Feature owner | Components, hooks, feature api-client, zod schemas | Cross-feature imports of another feature's internals |
| `apps/web/components/` | Shared app UI | Frontend | Composed, app-aware shared components | Feature-specific logic; primitives (those live in `@propulse/ui`) |
| `apps/api/src/contexts/<c>/domain/` | Pure domain | Context owner | Entities, VOs, domain services, events, port interfaces | NestJS decorators, Prisma, HTTP, env, `any` I/O |
| `apps/api/src/contexts/<c>/application/` | Use cases | Context owner | Command/query handlers, event handlers, orchestration | SQL, framework controllers, third-party SDK calls |
| `apps/api/src/contexts/<c>/infrastructure/` | Adapters | Context owner | Prisma repos, external SDK adapters, mappers | Domain rules / business decisions |
| `apps/api/src/contexts/<c>/presentation/` | API surface | Context owner | Controllers, WS gateways, auth policies, request DTOs | Business logic, persistence, cross-context imports |
| `apps/api/src/shared/` | Cross-cutting infra | Platform | Tenant context, guards, interceptors, event bus, outbox | Context-specific domain logic |
| `apps/voice-gateway/` | Realtime voice runtime | Voice team | Media/session handling reusing context app services | Duplicated domain logic; CRM/KB tables direct |
| `apps/workers/` | Async processors | Platform + context owners | BullMQ processors invoking application use cases | New business logic not present in `contexts/` |
| `packages/contracts/` | Shared API/event types | Platform | zod schemas, DTO/event/enum types, ids | Any runtime logic, any I/O, framework code |
| `packages/domain-kernel/` | Shared kernel | Architects | Cross-context VOs & base classes | Context-specific entities |
| `packages/database/` | Persistence platform | Platform/DBA | Prisma schema, migrations, RLS, tenant middleware, seeds | Business/domain logic |
| `packages/ui/` | Design system | Frontend | shadcn/ui primitives, tokens | App/feature-specific components, data fetching |
| `packages/observability/` | Logging/tracing | Platform | logger, Sentry, metrics helpers | Business logic |
| `infra/` | IaC & deploy | DevOps | Terraform/CDK, Dockerfiles, ECS defs, scripts | App secrets in plaintext, application code |
| `docs/` | Knowledge system | All (per CODEOWNERS) | Architecture/standards/specs/ADRs/runbooks | Generated code, secrets, transient notes |

---

## 5. Hard rules (the ones that protect the architecture)

1. **No cross-context imports of internals.** `contexts/crm` may import from
   `contexts/campaign` **only** its published application interface or its event/contract
   types — never its `domain/` or `infrastructure/`. Lint-enforced (Phase 4).
2. **No context touches another context's Prisma models/tables.** One context's tables are
   private. Cross-context data flows via published queries or events.
3. **`domain/` imports nothing framework/infra.** A grep for `@nestjs`, `@prisma`, `axios`,
   `bullmq`, `redis`, `aws-sdk` inside any `domain/` folder must return zero hits (CI check).
4. **`packages/` never import `apps/`.**
5. **All env access goes through `packages/config`** (validated). No `process.env.X` scattered
   in code.
6. **Every tenant-scoped Prisma model includes `organizationId`** and is registered with the
   tenant middleware; bypass requires an explicit, audited super-admin path.
7. **One image, many roles** for workers/voice — same code, configured by env, so domain logic
   has exactly one home.
