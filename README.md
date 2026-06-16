# Propulse AI

> **AI Operating System for Real Estate** — deploy human-like AI employees that capture,
> qualify, nurture, schedule, and convert property buyers across website chat, WhatsApp, and
> phone. Multi-tenant, enterprise-grade, internally deployed in under 30 minutes per client.

This repository contains the definitive architectural blueprint **and** the Phase 0 monorepo
skeleton that wires in the guardrails before feature code begins. Read the docs before writing
a line of code.

**Phase 0 status (scaffold in place):** Turborepo + pnpm workspace with `apps/{web,api,voice-gateway,workers}`
and `packages/{domain-kernel,contracts,config,database,observability,ui,eslint-config,tsconfig}`.
The architecture is enforced mechanically — `pnpm install && pnpm turbo run typecheck && pnpm test
&& pnpm boundaries` all pass, and the Clean Architecture boundaries are validated by
dependency-cruiser, a domain-purity script, and an architecture fitness test (a deliberate
domain→infra import fails CI). Bounded contexts beyond the `iam` reference example are module
stubs awaiting implementation per the [roadmap](docs/ROADMAP.md).

```bash
pnpm install                      # install workspace
pnpm --filter @propulse/database generate   # generate Prisma client
pnpm turbo run typecheck test     # verify
pnpm boundaries                   # enforce architecture boundaries
pnpm dev                          # run apps (needs docker-compose services up)
```

---

## Start here (the 30-minute path)

Read these in order — they make any engineer or AI agent productive fast:

1. [`docs/PRODUCT_OVERVIEW.md`](docs/PRODUCT_OVERVIEW.md) — what we're building and why.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — the system architecture and the
   non-negotiable invariants. **The canon.**
3. [`docs/DOMAIN_RULES.md`](docs/DOMAIN_RULES.md) — bounded contexts, aggregates, events, invariants.
4. [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md) — where code goes and why.
5. [`docs/CLEAN_ARCHITECTURE.md`](docs/CLEAN_ARCHITECTURE.md) — the dependency rules CI enforces.

Then, depending on what you're doing:
- Building a feature → [`docs/FEATURE_BLUEPRINT.md`](docs/FEATURE_BLUEPRINT.md) + [`docs/feature-specs/`](docs/feature-specs/)
- An AI coding agent → [`docs/AI_AGENT_GUIDELINES.md`](docs/AI_AGENT_GUIDELINES.md)
- Contributing → [`CONTRIBUTING.md`](CONTRIBUTING.md) + [`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md)
- Onboarding/setup → [`docs/ONBOARDING_GUIDE.md`](docs/ONBOARDING_GUIDE.md)

## The 30-second architecture

A **multi-tenant, event-driven modular monolith** in a Turborepo monorepo:

- `apps/web` — Next.js client dashboard + super-admin console
- `apps/api` — NestJS REST + WebSocket; one module per **bounded context**, hard boundaries
- `apps/voice-gateway` — long-lived realtime voice sessions (Twilio/Deepgram/OpenAI/ElevenLabs)
- `apps/workers` — BullMQ async processors (ingestion, transcription, campaigns, follow-ups…)
- `packages/*` — shared contracts, domain-kernel, database (Prisma), ui, config, observability

**Three invariants that govern everything:** (1) tenant isolation is sacred — every row, key,
job, file, and vector is scoped to `organizationId`; (2) the domain core imports no
infrastructure; (3) cross-context side effects are **events**, never inline calls.

## Documentation map

| Area | Doc |
|---|---|
| Product | [PRODUCT_OVERVIEW](docs/PRODUCT_OVERVIEW.md) · [Source PRD](docs/prd/CALLING_AI_V1.md) · [PRD_REVIEW](docs/PRD_REVIEW.md) |
| Architecture | [ARCHITECTURE](docs/ARCHITECTURE.md) · [DOMAIN_RULES](docs/DOMAIN_RULES.md) · [REPOSITORY_STRUCTURE](docs/REPOSITORY_STRUCTURE.md) · [CLEAN_ARCHITECTURE](docs/CLEAN_ARCHITECTURE.md) |
| Contracts | [API_CONTRACTS](docs/API_CONTRACTS.md) · [EVENT_CATALOG](docs/EVENT_CATALOG.md) |
| Decisions | [DECISION_LOG](docs/DECISION_LOG.md) · [ADRs](docs/adr/) |
| Standards | [ENGINEERING_STANDARDS](docs/ENGINEERING_STANDARDS.md) · [CONTRIBUTING](CONTRIBUTING.md) · [AI_AGENT_GUIDELINES](docs/AI_AGENT_GUIDELINES.md) |
| Delivery | [ROADMAP](docs/ROADMAP.md) · [FEATURE_BLUEPRINT](docs/FEATURE_BLUEPRINT.md) · [feature-specs](docs/feature-specs/) |
| Ops & quality | [DEPLOYMENT_GUIDE](docs/DEPLOYMENT_GUIDE.md) · [TROUBLESHOOTING](docs/TROUBLESHOOTING.md) · [runbooks](docs/runbooks/) · [SECURITY_GUIDELINES](docs/SECURITY_GUIDELINES.md) · [PERFORMANCE_GUIDELINES](docs/PERFORMANCE_GUIDELINES.md) |

## Status & roadmap

Targeting an **internal production MVP in 12 weeks** (inbound across website chat + WhatsApp +
basic voice, grounded in a knowledge base, with CRM/qualification/scoring/assignment,
appointments, notifications, and analytics). Outbound realtime-voice campaigns are Phase 2.
See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Tech stack

Next.js · TypeScript · Tailwind · shadcn/ui · NestJS · Prisma · PostgreSQL (+pgvector +FTS) ·
Redis/ElastiCache · BullMQ · WebSockets · AWS S3 · Docker · ECS Fargate · CloudWatch · Sentry ·
Twilio · Deepgram · OpenAI Realtime · ElevenLabs · WhatsApp Business API · Google Maps.

## License

Proprietary — internal. Not for public distribution.
