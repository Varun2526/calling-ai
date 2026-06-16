# Propulse AI — Troubleshooting Guide

> **Purpose:** First-responder reference for diagnosing and fixing production issues across Propulse AI's
> four services (`apps/web`, `apps/api`, `apps/voice-gateway`, `apps/workers`) and shared infra. Pairs with
> [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) and the [`runbooks/`](runbooks/). Read
> [`ARCHITECTURE.md`](ARCHITECTURE.md) §7–§10 to understand the event/outbox/queue pipeline referenced throughout.
>
> **Owner:** DevOps / Platform team (on-call rotation). **Update frequency:** after every incident
> (add new symptoms + link the runbook produced) and whenever architecture changes.
> **Status:** architecture stage — commands describe the **intended/target** tooling.

---

## 1. How to Diagnose (start here)

### 1.1 Where the logs are

Structured JSON logs (via `packages/observability`), one **CloudWatch log group per service per
environment**:

| Symptom area                                                                                                 | Look in                                  | Also check                                   |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------- | -------------------------------------------- |
| HTTP/WS/REST, auth, webhooks                                                                                 | `apps/api` log group                     | ALB access logs, WAF logs                    |
| Voice calls, STT/TTS, realtime turn latency                                                                  | `apps/voice-gateway` log group           | provider (Deepgram/ElevenLabs/OpenAI) status |
| Async jobs (ingestion, embed, transcribe, summary, campaign, follow-up, notify, analytics, **outbox-relay**) | `apps/workers` log group                 | BullMQ/Redis, third-party quotas             |
| Dashboard / BFF                                                                                              | `apps/web` log group                     | browser console, Sentry frontend             |
| DB / cache / network                                                                                         | RDS + ElastiCache metrics, VPC flow logs | CloudWatch alarms                            |

- **Errors & traces:** **Sentry**, filtered by service + **release** (git SHA) + environment. Use Sentry to
  confirm whether an error started with a specific deploy (`DEPLOYMENT_GUIDE.md` §7).
- **Metrics & alarms:** **CloudWatch dashboards** (API latency/5xx, voice concurrency/turn latency, queue
  depth/DLQ, RDS connections, Redis memory). Every alarm should link to a runbook.

### 1.2 Correlation / causation IDs (tracing one interaction end-to-end)

Every inbound request/webhook is stamped with a **correlation id** that propagates across the whole
pipeline. Use it to follow one interaction across services:

```
inbound webhook / request   ── correlationId ──▶ apps/api controller
   (validate signature, normalize, enqueue)            │
                                                 writes outbox row  (same DB txn as the aggregate change)
                                                        │ correlationId + causationId carried in event payload
                          outbox-relay (apps/workers) ──┴──▶ publishes to BullMQ
                                                        │
                          typed handler (apps/workers) ──▶ does work, may emit new events
                                                        │ new event.causationId = prior event.id
                          realtime push ──▶ Redis pub/sub ──▶ apps/api WS gateway ──▶ tenant room
```

- **correlationId** = the whole interaction (search every log group for it to assemble the timeline).
- **causationId** = the immediate parent event/command that triggered this one (walk the chain to find
  _why_ something happened, per the event choreography in `ARCHITECTURE.md` §8).
- **organizationId** is on every log line, event, job, cache key, and S3 key (`ARCHITECTURE.md` §10) — always
  filter by it, and **never** widen a query past one org while debugging prod.

### 1.3 Tracing a request and an event through outbox → BullMQ

1. Grab the `correlationId` from the API log / Sentry / the user report.
2. In `apps/api` logs: confirm the request was authenticated, tenant-scoped, and (for webhooks) the
   **signature verified**.
3. In Postgres `outbox` table: find rows for that `correlationId` — confirm the event was **committed**
   (status, `created_at`) and whether it has been **relayed** (relayed/published timestamp).
4. In `apps/workers` (outbox-relay) logs: confirm the relay picked it up and enqueued to BullMQ.
5. In BullMQ: find the job (by correlationId in job data). Is it `waiting`, `active`, `completed`, or
   `failed`? How many attempts? (§4)
6. In the handler's worker logs: confirm idempotent processing and any emitted follow-on events (walk
   `causationId` forward).

If the event is in `outbox` but never reached BullMQ → **relay problem** (relay down / Redis down). If it
reached BullMQ but is stuck → **worker problem** (scaling, crash loop, third-party throttle).

---

## 2. Symptom → Likely Cause → Fix

| Symptom                                                         | Likely cause                                                                                                                                           | First fix / action                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Inbound webhook not processed** (WhatsApp/Twilio/Meta/Google) | (a) **Signature verification failing** (wrong/rotated secret, clock skew, proxy mangling body); (b) queue backlog so it's accepted but not yet handled | (a) Check `apps/api` logs for signature-reject lines; confirm the provider secret in Secrets Manager matches current; ensure raw body is preserved for HMAC; check timestamp/nonce replay window. (b) Confirm 2xx was returned, then trace the event through outbox→BullMQ (§1.3); if backlog → [runbook 0001](runbooks/0001-queue-backlog.md).        |
| **AI not responding / slow** (text)                             | **LLM timeout or rate limit** (OpenAI), KB retrieval slow, prompt assembly slow                                                                        | Check `apps/api`/`apps/workers` logs + Sentry for OpenAI 429/timeout; check provider status + your quota; verify KB cache hit rate and pgvector index health; confirm < 2s p95 budget (`ARCHITECTURE.md` §13). Back off + retry; if quota → raise limit / shed via per-org rate limiting.                                                              |
| **Voice call latency / drops**                                  | voice-gateway saturated (too many concurrent calls), STT/TTS provider latency, task draining mid-call, stickiness broken                               | Check **concurrent active calls** metric + turn-latency p95 (target < 1.2s); scale out voice-gateway; check Deepgram/ElevenLabs status; verify ALB stickiness + Redis session checkpointing; confirm no routine deploy hard-killed calls (`DEPLOYMENT_GUIDE.md` §3.3/§5).                                                                              |
| **Transcription stuck**                                         | transcription queue backlog, provider failure, large recording, worker crash loop                                                                      | Inspect the transcription queue depth + failed jobs (§4); check provider; check S3 object exists/readable (signed URL/tenant prefix); requeue failed jobs after fixing root cause.                                                                                                                                                                     |
| **Embeddings / ingestion stuck**                                | embedding queue backlog, OpenAI rate limit, extraction failure on a bad document, pgvector write contention                                            | Check ingestion/embedding queue depth + DLQ; check OpenAI 429; isolate the failing document (poison job → DLQ); verify pgvector index + DB write headroom; re-run after fix.                                                                                                                                                                           |
| **Notifications not delivered** (in-app/email/WhatsApp)         | notification queue backlog, SES/WhatsApp provider error, bad recipient, `notifications.dispatch.requested.v1` never emitted                            | Trace from the source event through outbox (§1.3) — was dispatch even requested? Check notifications worker logs + provider response; verify recipient/opt-out (DNC); requeue.                                                                                                                                                                         |
| **Lead not assigned**                                           | assignment event handler failed, `crm.lead.upserted.v1` not consumed, assignment rule misconfig                                                        | Trace the lead's events; confirm CRM assignment handler ran (worker logs); check org assignment rules; check for a failed job in the relevant queue; requeue handler.                                                                                                                                                                                  |
| **WebSocket disconnects**                                       | `apps/api` task draining/rolling deploy, ALB idle timeout, client network, scale-in                                                                    | Check if a deploy/scale-in coincided (clients should auto-reconnect to a healthy task — `DEPLOYMENT_GUIDE.md` §3.2); verify ALB idle timeout > heartbeat interval; confirm Redis pub/sub healthy (fan-out path). Usually self-heals on reconnect.                                                                                                      |
| **Cross-tenant data concern** (org A seeing org B's data)       | **TREAT AS Sev-1 SECURITY INCIDENT** — possible RLS/guard/middleware bypass                                                                            | **Page security + DevOps immediately.** Preserve logs. Identify scope by `organizationId` in logs/audit. Verify RLS is enabled on the table, tenant guard derives org from session (not body), and Prisma middleware injected the filter (`ARCHITECTURE.md` §10). Do **not** patch silently — follow incident process; this overrides normal severity. |
| **DB connection exhaustion**                                    | Fargate task count × Prisma pool > RDS max connections; PgBouncer down/misconfigured; long-running queries                                             | Check RDS connection count + active queries; verify PgBouncer pooling (`ARCHITECTURE.md` §12); reduce per-task pool size or scale RDS / add replica routing for reads; kill runaway queries; add indexes / fix N+1.                                                                                                                                    |
| **Redis / queue backlog**                                       | spike (campaign import, webhook storm), workers under-scaled, downstream third-party throttling, ElastiCache memory pressure/evictions                 | Check queue depth + oldest-job-age + DLQ; scale the affected worker role; check third-party rate limits; check Redis memory/evictions. Full procedure: [runbook 0001](runbooks/0001-queue-backlog.md).                                                                                                                                                 |
| **Migration failure during deploy**                             | bad SQL, lock timeout, non-expand-contract change against running old tasks, missing RLS on new tenant table                                           | Migration runs as a pre-deploy one-off task and gates rollout (`DEPLOYMENT_GUIDE.md` §4) — app tasks should **not** have rolled. Read migration task logs; **roll forward** with a corrective migration (avoid down-migrations); if data at risk, restore from the pre-migration snapshot. Verify expand–contract was followed.                        |

---

## 3. Common deeper checks

- **Is it the deploy?** Filter Sentry by release SHA; check if errors began at a deploy timestamp. If yes →
  roll back to the previous digest (`DEPLOYMENT_GUIDE.md` §8) first, diagnose after.
- **Is it one tenant or all?** Group by `organizationId`. A single noisy tenant → check per-org rate limits;
  all tenants → infra/provider/global issue.
- **Is it a provider?** OpenAI/Deepgram/ElevenLabs/Twilio/WhatsApp/SES status pages + your quota dashboards;
  look for 429/5xx in logs (`ARCHITECTURE.md` §15 third-party risk).

---

## 4. Inspecting BullMQ & the Outbox

### 4.1 BullMQ (queues, failed jobs, DLQ)

Queues are Redis-backed; jobs carry `organizationId` + correlation/causation ids (`ARCHITECTURE.md` §10, §8).
Inspect via the ops tooling (intended: a Bull Board dashboard behind the admin console, plus CLI scripts in
`infra/scripts`):

- **Queue depth & states** per queue: `waiting`, `active`, `delayed`, `completed`, `failed`. Rising
  `waiting` + old `oldest-job-age` = backlog (the autoscaling signal for workers).
- **Failed jobs:** read the failure reason + stack (also in Sentry/worker logs) and the attempt count. Look
  for a single **poison job** repeatedly failing vs. a broad failure (provider down).
- **DLQ (dead-letter):** jobs that exhausted retries land here. Triage: fix root cause → **requeue** the
  DLQ'd jobs; for genuinely bad payloads, drop them (recorded). Because handlers are **idempotent**
  (`ARCHITECTURE.md` §8), requeuing is safe.
- **Rate limits / concurrency:** per-queue concurrency and per-org rate limits (`ARCHITECTURE.md` §12) protect
  downstream providers — if a provider is throttling, lowering concurrency may clear faster than retry storms.

### 4.2 The outbox table (Postgres)

The `outbox` table is the **durable source of truth for emitted events** (written in the same transaction as
the aggregate change — `ARCHITECTURE.md` §8). Inspect:

- **Unrelayed rows piling up** (committed but never published) → the **outbox-relay** processor is down or
  Redis is unreachable. Restart/scale the relay; verify Redis. Events are **not lost** (they're in Postgres)
  — they drain once the relay recovers (at-least-once delivery).
- **A specific interaction:** filter by `correlationId` to see exactly which events were committed and when
  each was relayed (§1.3).
- **Never** manually mutate aggregate state without also reconciling the outbox — emit a corrective event
  instead.

---

## 5. Escalation Path

1. **On-call DevOps/SRE** acknowledges the CloudWatch alarm / page. Triage with §1–§4 and the linked runbook.
2. If not resolved within the runbook's target, or impact is widening → **escalate to the service's context
   owner** (CODEOWNERS) and the **on-call engineering lead**.
3. **Sev-1 triggers** (page immediately, do not wait): any **cross-tenant data exposure**, prod data loss,
   full outage of `apps/api` or `apps/voice-gateway`, or a security/secret compromise. Cross-tenant exposure
   is **always Sev-1** regardless of row count.
4. Declare an incident, open a channel, assign an **Incident Commander**, post status updates on a cadence.
5. After resolution: write/append the **runbook** in [`runbooks/`](runbooks/) and a blameless post-incident
   review; add the new symptom to §2 of this doc.

**Runbooks:** see [`runbooks/_TEMPLATE.md`](runbooks/_TEMPLATE.md) and the catalog in
[`runbooks/`](runbooks/) (e.g. [0001 — Queue backlog](runbooks/0001-queue-backlog.md)).
