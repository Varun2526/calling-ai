# Propulse AI

> **AI Operating System for Real Estate** — deploy human-like AI employees that capture,
> qualify, nurture, schedule, and convert property buyers across website chat, WhatsApp, and
> phone. Multi-tenant, enterprise-grade, internally deployed in under 30 minutes per client.

This repository is currently at the **architecture & foundation** stage. It contains the
definitive architectural blueprint, engineering standards, and documentation system that all
implementation must follow. **No application code is scaffolded yet — by design.** Read the
docs before writing a line of code.

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
