# Propulse AI — Deployment Guide

> **Purpose:** The canonical, end-to-end guide for building, releasing, and operating Propulse AI's
> deployable units (`apps/web`, `apps/api`, `apps/voice-gateway`, `apps/workers`) on AWS ECS Fargate.
> Read [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md) first —
> this document operationalizes the decisions made there.
>
> **Owner:** DevOps / Platform team (with context owners for service-specific tuning).
> **Update frequency:** every infra/pipeline change, every new deployable, every environment change —
> paired with an [ADR](adr/) when the change is architecturally significant.
> **Status:** the repo is at the architecture/scaffolding stage. Commands below describe the **intended /
> target** procedures and are the contract that `infra/` (Terraform/CDK) and `.github/workflows/` build toward.

---

## 1. Environments

We run **three** long-lived environments. Each is fully isolated; nothing is shared across the boundary
except the container images in ECR (immutable, promoted by digest).

| Environment | Purpose                                                                                            | Isolation                                                      | Data                                               | Who deploys                                        |
| ----------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **dev**     | Integration of merged trunk changes; always-on shared sandbox for engineers/agents                 | Separate AWS account + VPC                                     | Synthetic / seeded only (no real PII)              | Auto on merge to `main`                            |
| **staging** | Production rehearsal: pre-release validation, migration dry-runs, load/latency checks, smoke tests | Separate AWS account + VPC; prod-shaped infra at reduced scale | Anonymized prod-like dataset; no real customer PII | Auto on release candidate (RC) tag                 |
| **prod**    | Live multi-tenant customer traffic                                                                 | Separate AWS account + VPC; strictest WAF/SCP/guardrails       | Real tenant PII (encrypted, RLS-enforced)          | Manual gated promotion of the exact staging digest |

**Isolation principles (non-negotiable):**

- **Separate AWS accounts per environment** (recommended via AWS Organizations + SCPs). A bug or
  credential leak in dev must never reach prod data. Blast radius is the account boundary.
- **Separate VPCs**, subnets, security groups, RDS instances, ElastiCache clusters, S3 buckets,
  Secrets Manager/SSM trees, and ECS clusters per environment. No peering between dev and prod.
- **No cross-environment IAM.** ECS task roles are scoped per service _and_ per environment (least
  privilege, per `ARCHITECTURE.md` §14).
- **Config, not code, differs across environments.** The same image digest runs everywhere; behavior is
  driven by env/SSM. See §6.

---

## 2. Build & Release Pipeline

**Branching model: trunk-based.** Short-lived feature branches → PR → merge to `main`. `main` is always
releasable. Releases are **promotions of an immutable artifact**, never rebuilds.

```
PR opened ──▶ CI gates ──▶ merge to main ──▶ build+push images ──▶ deploy dev
                                                     │
                                          RC tag (vX.Y.Z-rc.N) ──▶ deploy staging ──▶ smoke + soak
                                                     │
                                       manual approval (release) ──▶ promote SAME digest ──▶ deploy prod
```

### 2.1 CI gates (GitHub Actions, on every PR)

Run via Turborepo (`turbo run ...`) with remote caching so only affected packages execute:

1. **Install** — `pnpm install --frozen-lockfile`.
2. **Lint** — `pnpm turbo run lint` (includes ESLint).
3. **Boundary check** — `pnpm turbo run boundaries` — enforces the hard rules in
   `REPOSITORY_STRUCTURE.md` §5 (no cross-context internal imports, `domain/` imports no framework/infra,
   `packages/` never import `apps/`). **A boundary violation fails the build.**
4. **Typecheck** — `pnpm turbo run typecheck`.
5. **Unit tests** — `pnpm turbo run test` (domain logic is pure → fast, no network).
6. **Integration / e2e** — Prisma + Postgres + Redis spun via service containers; includes the
   **cross-tenant isolation test suite** (`ARCHITECTURE.md` §14) — a tenant-leak test failure is a hard block.
7. **Build** — `pnpm turbo run build` to catch compile/bundle errors before image build.

PRs cannot merge unless all gates are green and CODEOWNERS approve.

### 2.2 Image build & push (on merge to `main`)

- Build **multi-stage Docker images** (`infra/docker/Dockerfile.<service>`) for each affected app.
- Tag every image with the **immutable git SHA** (`<service>:<sha>`) plus a moving `:<env>` convenience tag.
- Push to **Amazon ECR** (one repo per service). Enable ECR image scanning; fail the pipeline on
  CRITICAL CVEs in base layers.
- Record the image digest in the pipeline output — **digests are what get promoted**, never tags.

### 2.3 Deploy to ECS

- Render the ECS task definition for the service with the new image digest; register a new task-def revision.
- `aws ecs update-service --force-new-deployment` (or CDK/Terraform apply) → ECS performs a **rolling
  deploy** behind the ALB (see §8).
- Wait for the service to reach **steady state**; then run **smoke tests** (§9). Failure → auto-rollback.

### 2.4 Promotion

- **dev** is automatic on merge.
- **staging** deploys on cutting an RC tag; soak + smoke + migration dry-run run here.
- **prod** is a **manual, approval-gated** promotion of the **exact digest** validated in staging — no
  rebuild, no re-test of the artifact (we test the bytes that ship). A GitHub Environments protection rule
  requires a DevOps approver.

---

## 3. Per-Service Deploy Details

All four services are built from the monorepo; workers and voice-gateway reuse domain/application code via
`packages/` (no duplication — `REPOSITORY_STRUCTURE.md` §1).

### 3.1 `apps/web` (Next.js)

- **Build args:** `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_SENTRY_DSN`, build-time release
  id. Only `NEXT_PUBLIC_*` may be baked in; all are non-secret. Standalone output, multi-stage image.
- **Health check:** ALB target-group HTTP `GET /api/health` (lightweight route handler) — 200 = healthy.
- **Autoscaling signal:** ALB **request count per target** and **CPU**.
- **Graceful shutdown:** drain in-flight HTTP on `SIGTERM`; Next.js is stateless, so this is quick.
- **Notes:** BFF/proxy route handlers only (`apps/web/app/api`) — no domain logic.

### 3.2 `apps/api` (NestJS — REST + WebSocket)

- **Build args:** none secret. Runtime config from SSM/Secrets Manager at boot (§6).
- **Health checks:** `GET /health/live` (liveness — process up) and `GET /health/ready` (readiness — DB,
  Redis, migrations applied reachable). ALB uses `/health/ready`; ECS uses `/health/live`.
- **Autoscaling signals:** **CPU** and **p95 request latency** (custom CloudWatch metric). Scale out when
  p95 approaches the text latency budget (`ARCHITECTURE.md` §13: webhook→reply < 2s p95).
- **Graceful shutdown:** on `SIGTERM` → (1) deregister from ALB / stop accepting new connections,
  (2) **drain WebSocket connections** — emit a `reconnect` hint so clients fail over to a healthy task,
  (3) finish in-flight requests within the ECS stop timeout, (4) close DB/Redis pools. Set a generous
  `stopTimeout` so WS clients reconnect cleanly.
- **Notes:** stateless (sessions in Redis/JWT) → horizontally scalable. Webhook controllers do minimal
  sync work then enqueue (`ARCHITECTURE.md` §7).

### 3.3 `apps/voice-gateway` (NestJS — realtime voice/media)

- **Why a separate service** (`ARCHITECTURE.md` §0/§1, [ADR-0005](adr/0005-voice-gateway-separation.md)):
  long-lived, stateful, latency-critical media sessions must **not** be killed by a routine `apps/api`
  deploy. Different runtime profile, different scaling signal, different deploy cadence.
- **Build args:** none secret; STT/TTS/LLM provider config via SSM at runtime.
- **Health checks:** `GET /health/live` + `/health/ready` (checks Redis session store + provider
  connectivity). Keep checks cheap so they never compete with the realtime loop.
- **Autoscaling signal:** **concurrent active calls** (custom metric) — _not_ CPU alone. Scale out before
  saturation to protect the < 1.2s p95 voice turn budget (`ARCHITECTURE.md` §13).
- **Sticky sessions:** a call is pinned to one task for its lifetime (ALB stickiness / connection affinity).
  Session state is **checkpointed to Redis** so a draining task can hand off (`ARCHITECTURE.md` §12).
- **Graceful shutdown (special handling):** on `SIGTERM` → **stop accepting new calls immediately**, but
  **let active calls run to completion** (connection draining with a long `stopTimeout`, sized to the
  longest expected call). For tasks that must stop sooner, attempt checkpointed hand-off to a peer or a
  clean transfer to human handoff before terminating. **Never hard-kill a live call mid-conversation.**
- **Deploy cadence:** deploy during low-traffic windows; rolling with extra surge capacity so new calls
  always land on already-warm tasks.

### 3.4 `apps/workers` (BullMQ processors)

- **One image, many roles** (`REPOSITORY_STRUCTURE.md` §5.7): the same image runs different processor sets
  selected by env (e.g. `WORKER_QUEUES=ingestion,embedding` vs `transcription` vs `notifications`).
- **Build args:** none secret.
- **Health checks:** a lightweight HTTP `/health` sidecar (or ECS container health command) reporting Redis
  connectivity and that the processor loop is alive. No ALB (no inbound traffic).
- **Autoscaling signal:** **queue depth / oldest-job-age per queue** (custom CloudWatch metric published by
  the workers, or via the outbox-relay). Scale each role independently. Use **per-org rate limits** so a
  large tenant can't starve others (`ARCHITECTURE.md` §12 noisy-neighbor control).
- **Graceful shutdown:** on `SIGTERM` → stop pulling **new** jobs, **let in-flight jobs finish** (BullMQ
  graceful `close()`), then exit. Jobs are idempotent and at-least-once (`ARCHITECTURE.md` §8), so a worst
  case re-runs safely. Size `stopTimeout` above the longest expected job.

---

## 4. Database Migrations (Prisma)

Migrations live in `packages/database`. Apply with **`prisma migrate deploy`** (never `migrate dev` outside
local).

### 4.1 How migrations run (pre-deploy, one-off task)

- Migrations run as a **dedicated one-off ECS task** (`infra/scripts/migrate`) **before** the new app tasks
  roll out — _not_ in an app container's entrypoint (so N tasks don't race to migrate).
- The deploy pipeline gates the app rollout on the migration task exiting 0.
- Run on a **dedicated migration IAM role** that holds DDL privileges; app task roles do **not**.

### 4.2 Expand–contract (zero-downtime)

Because old and new app versions run **simultaneously** during a rolling deploy, every schema change must be
backward compatible. Use the **expand → migrate → contract** pattern across (at least) two releases:

1. **Expand** — additive only: add nullable columns / new tables / new indexes. Old code ignores them; new
   code can use them. Deploy.
2. **Backfill & dual-write** — backfill data via a job; new code writes both old and new shapes if renaming.
3. **Contract** — only after **all** running tasks are on the new code: drop old columns / tighten
   constraints / remove dual-writes. Deploy.

Never rename or drop a column in the same release that the new code starts depending on it.

### 4.3 RLS policy application

- Row-Level Security policies (`ARCHITECTURE.md` §10) live in `packages/database` alongside the schema and
  are applied as part of migrations (SQL migrations for `CREATE POLICY` / `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY`).
- **Every new tenant-scoped table must ship with its RLS policy in the same migration.** A migration that
  adds a tenant table without RLS should fail review (and ideally a CI lint check).
- App connections run as a non-superuser role bound by RLS; the migration role and audited super-admin path
  are the only ways to bypass.

### 4.4 Rollback considerations

- **Schema rollbacks are dangerous** (data loss on down-migrations). Prefer **roll forward**: ship a new
  corrective migration rather than reversing.
- The expand–contract discipline means a **bad app release can be rolled back without touching the schema**
  (old code still works against the expanded schema). This is the primary safety net.
- Keep a fresh **RDS snapshot taken immediately before** any contract-phase migration (§10) for true
  emergency recovery.

---

## 5. Realtime / Voice Deploy Nuances

- **Long-lived sessions** (WS in `apps/api`, media in `apps/voice-gateway`) survive longer than a request,
  so deploys must **drain, not drop** (§3.2, §3.3).
- **Stickiness** keeps a session on one task; **Redis checkpointing** allows hand-off so draining never
  forces a hard disconnect.
- **voice-gateway is deliberately separate** so the high-churn `apps/api` deploy cadence never interrupts a
  live call (`ARCHITECTURE.md` §0). Deploy the two on independent schedules.
- Provide **surge capacity** during voice deploys so new calls always have a warm, non-draining task.

---

## 6. Secrets & Configuration

- **Source of truth for _what_ config exists:** `.env.example` at the repo root — every variable documented,
  **no secret values**. All code reads env through `packages/config` (validated zod schema;
  `REPOSITORY_STRUCTURE.md` §5.5) — no scattered `process.env`.
- **Where values live:** **AWS Secrets Manager** (secrets: DB creds, provider API keys for
  OpenAI/Deepgram/ElevenLabs/Twilio/WhatsApp, JWT signing keys) and **SSM Parameter Store** (non-secret
  runtime config). Injected into ECS tasks via task-definition `secrets`/`environment` — resolved at task
  start, never baked into images.
- **No secrets in images, logs, or git.** Image scanning + secret scanning in CI. Rotate provider keys
  (`ARCHITECTURE.md` §14); the app reads at boot so rotation = redeploy/refresh.
- **Per-environment, per-service secret trees** (e.g. `/propulse/prod/api/...`), accessible only by that
  service's task role in that account (least privilege).

---

## 7. Observability Wiring

- **CloudWatch** — structured JSON logs per service (one log group per service per environment), metrics,
  and **alarms** (`packages/observability` provides the shared logger/metrics helpers). Dashboards:
  - **API:** p95/p99 latency, 5xx rate, request count, CPU/mem, DB pool usage.
  - **Voice:** concurrent active calls, turn latency p95 (target < 1.2s), call drop rate, provider errors.
  - **Workers:** queue depth + oldest-job-age per queue, job failure rate, DLQ size, outbox lag.
  - **Platform:** RDS connections/CPU/replica lag, ElastiCache memory/evictions, ALB/WAF.
- **Alarms** wired to PagerDuty/Slack (escalation in `TROUBLESHOOTING.md`). Each alarm should map to a
  **runbook** in `docs/runbooks/`.
- **Sentry** — error + performance tracing for all four services. On each deploy the pipeline **creates a
  Sentry release** tagged with the git SHA and **uploads source maps** (web + Node), then associates commits
  so errors deep-link to code and to the deploy that introduced them. Set the release/environment in the SDK
  init so issues are attributable to a specific rollout.
- **Correlation:** propagate a correlation id from inbound request/webhook → events → BullMQ jobs so a
  single interaction is traceable end-to-end across services (see `TROUBLESHOOTING.md`).

---

## 8. Release Strategy, Rollback & Smoke Tests

- **Strategy:** **rolling deploy** behind the ALB with health-gated replacement (ECS minimum-healthy +
  surge). Blue/green via **CodeDeploy** is the documented upgrade path for `apps/api`/`apps/web` once
  traffic warrants it (lets us shift traffic and bake before cutover).
- **Health-gated:** new tasks must pass `/health/ready` and the ALB target check before old tasks drain.
- **Smoke tests (post-deploy, every environment):** run from `infra/scripts/smoke-test` against the freshly
  deployed env:
  - `apps/api`: `/health/ready` 200; auth flow; create+read a lead (tenant-scoped); a tenant-isolation
    probe (org A cannot read org B).
  - `apps/web`: dashboard renders; calls API successfully.
  - `apps/voice-gateway`: health + a synthetic call setup teardown.
  - `apps/workers`: enqueue a no-op job and confirm it processes; outbox relay heartbeat.
- **Rollback:** because artifacts are immutable digests, rollback = **redeploy the previous task-def
  revision / previous digest** (one command / one pipeline button). Combined with expand–contract (§4.2),
  app rollback needs **no schema change**. Document the last-known-good digest in the deploy record.

---

## 9. Disaster Recovery & Backup

- **RDS PostgreSQL:** automated daily **snapshots** + **Point-In-Time Recovery (PITR)** enabled; retention
  per environment (prod longest). Take a **manual snapshot before risky/contract migrations** (§4.4).
  Periodically **test restores** (a restore you've never tested is not a backup).
- **Multi-AZ** RDS in prod for failover; read replica for Analytics/heavy reads (`ARCHITECTURE.md` §12).
- **S3:** **versioning enabled** on recording/document buckets (recover overwrites/deletes); lifecycle
  rules; cross-region replication for prod-critical buckets if RPO requires it. Tight bucket policies +
  short-lived signed URLs (`ARCHITECTURE.md` §14).
- **ElastiCache Redis:** treated as **rebuildable cache + transient queue state**, not a system of record.
  Enable persistence/snapshots where queue durability matters, but the **outbox** (in Postgres) is the
  durable source for events (`ARCHITECTURE.md` §8) — Redis loss degrades, it does not lose committed events.
- **Secrets:** versioned in Secrets Manager; recoverable. IaC in `infra/` is the source of truth to rebuild
  any environment from scratch.
- **RPO/RTO:** define per environment in the DR runbook; prod RPO bounded by PITR, RTO by IaC rebuild +
  restore time.

---

## 10. Deploy Checklist

**Before:**

- [ ] PR merged to `main`; all CI gates green (lint, boundaries, typecheck, unit, integration, **cross-tenant tests**).
- [ ] Image built, pushed to ECR, scanned (no CRITICAL CVEs); digest recorded.
- [ ] Migration reviewed for **expand–contract** safety; RLS policy included for any new tenant table.
- [ ] `.env.example` updated for any new config; corresponding SSM/Secrets entries created per environment.
- [ ] Staging deploy green: smoke + soak passed; migration dry-run on staging clean.
- [ ] For prod: manual approval obtained; **fresh RDS snapshot** taken if contract-phase migration.

**During:**

- [ ] Run migration one-off task → exit 0 before app rollout.
- [ ] Roll out task-def revision (rolling/blue-green); watch ECS reach steady state.
- [ ] Watch CloudWatch (latency, 5xx, queue depth, voice concurrency) and Sentry for new release errors.

**After:**

- [ ] Smoke tests pass against the live environment (incl. tenant-isolation probe).
- [ ] Sentry release created + source maps uploaded + commits associated.
- [ ] Dashboards healthy for 15–30 min; no new alarms.
- [ ] Record deployed digest as last-known-good; note any follow-up (e.g. pending contract migration).
- [ ] If anything is off → roll back to previous digest and open an incident (`TROUBLESHOOTING.md`).
