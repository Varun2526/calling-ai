# Runbook 0001 — BullMQ Queue Backlog / Workers Falling Behind

> Operational runbook for when `apps/workers` cannot keep up and jobs pile up in BullMQ. Pairs with
> [`TROUBLESHOOTING.md`](../TROUBLESHOOTING.md) §4 (inspecting BullMQ + outbox) and
> [`DEPLOYMENT_GUIDE.md`](../DEPLOYMENT_GUIDE.md) §3.4 (worker autoscaling/shutdown).
> Commands are the **intended/target** procedures (platform at architecture stage).

---

## Metadata

| Field | Value |
|---|---|
| **Runbook ID** | 0001 |
| **Title** | BullMQ queue backlog / workers falling behind |
| **Severity** | Sev-2 (escalates to Sev-1 if it stalls a Sev-1-class path — e.g. notifications/follow-ups missing SLAs at scale, or campaign sends frozen org-wide) |
| **Owner** | Platform team (with the context owner for the specific queue: ingestion/embedding/transcription/summary/campaign/follow-up/notifications/analytics) |
| **Affected services** | `apps/workers`, Redis/ElastiCache, and any downstream third party (OpenAI/Deepgram/ElevenLabs/Twilio/WhatsApp/SES) |
| **Last reviewed** | 2026-06-16 |
| **Related** | [`ARCHITECTURE.md`](../ARCHITECTURE.md) §8 (outbox→BullMQ), §12 (queues as shock absorbers, per-org fairness) |

---

## 1. Summary

One or more BullMQ queues are growing faster than `apps/workers` can drain them: `waiting` count climbs and
`oldest-job-age` rises. Effects depend on the queue — delayed transcriptions/summaries, stalled
embeddings/ingestion, undelivered notifications, frozen campaign/follow-up sends. Most common causes: a
**spike** (50k-lead campaign import, webhook storm), **under-scaled workers**, or a **downstream third-party
rate limit** throttling the workers.

## 2. Detection / Alerts

- **Triggering alarm:** CloudWatch **queue-depth / oldest-job-age** alarm per queue (custom metric published
  by workers/outbox-relay) crosses threshold for the sustained period → PagerDuty/Slack.
- **Other signals:** rising job **failure rate** or **DLQ size** panels; worker CPU pegged or, conversely,
  idle while depth climbs (→ blocked on a third party); customer reports of delayed
  notifications/transcripts.
- **Confirm it's this incident:** depth is rising **and** `completed`-per-minute is flat/declining (true
  backlog), as opposed to a one-off spike that's already draining.

## 3. Impact

- **Scope:** identify the **queue(s)** and whether it's one tenant or all (group job data by
  `organizationId`). A single large tenant's import shouldn't starve others — per-org rate limiting
  (`ARCHITECTURE.md` §12) should contain it; if it isn't, that's a finding.
- **User-visible effect by queue:** transcription/summary delay; KB answers degraded (embedding/ingestion);
  missed/late notifications & reminders; stalled campaign outreach/follow-ups.
- **SLO at risk:** async freshness expectations; cascading to text reply quality if KB retrieval is stale.

## 4. Diagnosis Steps

1. **Identify the queue(s):** open the queue-depth dashboard / Bull Board; note which queues have rising
   `waiting` + high `oldest-job-age`. Is it one queue or many? (Many queues backed up at once → suspect
   Redis or the **outbox-relay**, not a single processor.)
2. **Inbox vs. throughput:** is the **arrival rate** spiking (a campaign import / webhook storm) or has
   **throughput dropped** (workers crashing, throttled, or scaled in)? Compare `added`/min vs.
   `completed`/min.
3. **Worker health:** check `apps/workers` task count, CPU/mem, and logs for the affected role. Crash loop?
   `SIGKILL` from OOM? Repeated errors?
4. **Failed jobs / DLQ:** inspect failed jobs (TROUBLESHOOTING §4.1). Distinguish a **poison job**
   (one payload failing repeatedly, eating retries/attempts) from **broad failures** (provider down).
5. **Third-party throttling:** check logs for **429 / rate-limit** from OpenAI/Deepgram/ElevenLabs/Twilio/
   WhatsApp/SES and the provider status page + your quota dashboard. Workers idle-but-backlogged usually =
   throttled upstream.
6. **Redis health:** ElastiCache memory, evictions, CPU, connections. Memory pressure/evictions can stall
   queues and the relay.
7. **Outbox-relay:** if many queues are starved and the **outbox** has unrelayed rows piling up
   (TROUBLESHOOTING §4.2), the relay (not the processors) is the bottleneck.

## 5. Mitigation / Remediation Steps

Apply fastest-safe relief first.

1. **Scale out the affected worker role.** Raise the ECS desired count for that role (workers are
   horizontally scalable, idempotent, at-least-once — `ARCHITECTURE.md` §8). Autoscaling on queue depth
   should do this; if it's lagging, scale manually. Confirm `completed`/min rises and depth falls.
2. **If throttled by a third party:** do **not** just add workers (worsens 429 storms). Instead **lower
   per-queue concurrency / per-org rate limits** to match the provider's allowed rate, let BullMQ backoff +
   retry drain it smoothly (queues are the shock absorber), and/or request a quota increase. Re-raise
   concurrency once clear.
3. **If a poison job:** move it to the **DLQ** (or pause/remove it) so it stops consuming retry capacity and
   blocking the line; capture its payload + error for root cause.
4. **If a spike (import/webhook storm):** let it drain at the controlled rate — that's the intended design.
   Add temporary worker capacity to shorten drain time. Verify per-org rate limiting is protecting other
   tenants; if one org is starving others, tighten its per-org limit.
5. **If Redis memory pressure:** clear evictable cache pressure / scale the ElastiCache node; ensure the
   queue keyspace has headroom.
6. **If outbox-relay is down/behind:** restart/scale the relay; events are durable in Postgres and will
   drain once it recovers (no data loss).
7. **Drain the DLQ:** once root cause is fixed, **requeue** DLQ'd jobs (idempotent handlers make this safe —
   TROUBLESHOOTING §4.1). Drop only genuinely invalid payloads, and record what was dropped.
8. **Verify recovery:** queue depth + oldest-job-age back under alarm threshold and trending down;
   failure rate normal; DLQ drained; downstream effects (notifications/transcripts) caught up.

## 6. Rollback

- If a **recent deploy** caused the slowdown (e.g. a regression in a processor — check Sentry by release
  SHA), **roll back `apps/workers` to the previous digest / task-def revision** (`DEPLOYMENT_GUIDE.md` §8).
  No schema change needed (expand–contract).
- If a **config change** (concurrency/rate-limit) made it worse, revert that SSM value.
- Backlog itself doesn't "roll back" — it drains once throughput exceeds arrival rate.

## 7. Communication

- **Internal:** post in the incident channel which queue(s), suspected cause, and current depth/ETA to
  drain. Assign an Incident Commander if Sev-1.
- **Cadence:** update every 15–30 min while draining; note when depth peaks and starts falling.
- **Escalation:** if not draining after scaling + throttle adjustments, or impact widens, page the context
  owner and on-call eng lead (TROUBLESHOOTING §5).
- **Customer status:** only if a customer-visible SLA is breached org-wide (e.g. notifications materially
  delayed) — DevOps + IC decide; post + send all-clear when caught up.

## 8. Post-Incident Actions

- [ ] Blameless review: reconstruct the spike/throttle timeline; identify why autoscaling didn't absorb it.
- [ ] Tune **queue-depth/oldest-job-age alarm** thresholds and worker **autoscaling** targets/step sizes.
- [ ] Adjust **per-queue concurrency** and **per-org rate limits** to match real third-party quotas.
- [ ] Add/raise **provider quotas** or add a provider fallback if rate-limiting was the cause
      (`ARCHITECTURE.md` §15 third-party risk).
- [ ] Add a **DLQ-size alarm** if missing; document any recurring poison-job class and fix its handler.
- [ ] Update this runbook + TROUBLESHOOTING §2 with anything learned.
