# Propulse AI — Performance Guidelines

> **Owner:** Platform Engineering · **Update frequency:** quarterly, plus whenever a latency
> budget/SLO changes, a new third-party provider is added, or a perf incident produces a learning
> (paired with an [ADR](adr/) when architecturally significant).
> **Audience:** all engineers + AI agents.
> Builds on [`ARCHITECTURE.md`](ARCHITECTURE.md) (§12 scalability, §13 performance) and
> [`DOMAIN_RULES.md`](DOMAIN_RULES.md). Security constraints from
> [`SECURITY_GUIDELINES.md`](SECURITY_GUIDELINES.md) are **not** negotiable for performance —
> tenant scoping stays on every cache key, query, and queue job.

---

## 0. The one metric that defines the product

> **Voice end-to-end turn latency** — the moment the human stops speaking to the moment AI audio
> starts playing — **target < 1.2s p95** (ARCHITECTURE §13). This is the **"is it a person or an
> AI?"** metric. If we miss it, the core value proposition fails (ARCHITECTURE §15 top risk).
> Everything in §2 exists to protect this number. The text path (< 2s p95) matters; the voice path
> is existential.

---

## 1. Latency budgets

| Path                                                | Budget (p95)         | Notes                                                                |
| --------------------------------------------------- | -------------------- | -------------------------------------------------------------------- |
| **Voice turn** (user stops → AI audio starts)       | **< 1.2s**           | The human-ness bar. Streaming pipeline, §2.                          |
| **Text conversation** (webhook → AI reply)          | **< 2s**             | Chat/WhatsApp. §3 caching + grounded RAG.                            |
| KB/CRM search during a live conversation            | tens of ms (cached)  | Must be cache + indexed pgvector; never a cold path on the hot loop. |
| Dashboard / lead-list / timeline load               | < 500ms p95          | Read models for Analytics; paginated; no N+1.                        |
| Config CRUD (org / AI-employee)                     | < 300ms p95          | Cache-invalidating writes (§3).                                      |
| Async (ingestion, transcription, summary, campaign) | not latency-critical | Throughput + fairness matter, not turn latency (§5).                 |

**Rule:** if a third party with variable latency sits on a user-waiting path and isn't required to
render the current screen or the current turn, it belongs on a queue (ARCHITECTURE §9). The voice
realtime loop is the single streaming exception, and it lives in `voice-gateway`.

---

## 2. Voice pipeline — protecting the 1.2s budget

The voice realtime loop runs in `apps/voice-gateway` (ARCHITECTURE §1, ADR-0005), separated from
`apps/api` precisely so a routine API deploy can't kill a live call.

- [ ] **Stream STT partials.** Feed Deepgram partial transcripts as they arrive; do **not** wait
      for the final transcript before starting downstream work (ARCHITECTURE §13).
- [ ] **Start LLM reasoning on partials.** Begin prompt assembly / speculative reasoning on
      stable partial transcripts; commit/correct on finalization. `ReasoningOrchestrator` (BC-1.AI)
      should accept incremental input.
- [ ] **Stream TTS output.** Start ElevenLabs/realtime TTS on the first sentence/clause of the LLM
      stream; begin audio playback before the full reply is generated. Never buffer the whole reply.
- [ ] **Barge-in is first-class.** `BargeInHandler` (BC-3) must cut TTS within a frame or two when
      the caller starts speaking — a human-like agent stops talking when interrupted.
- [ ] **Pre-warm the hot path.** AI-employee config, persona/prompt scaffolding, and the org's KB
      retrieval cache (§3) are warm _before_ the turn — prompt assembly is deterministic given the
      same inputs (BC-1.AI invariant), so precompute what you can at call start.
- [ ] **KB/CRM lookups on the voice loop are cache-first** and tenant-filtered; a cache miss must
      have a hard timeout + graceful degrade (answer from persona / escalate) rather than blow the
      budget. Low confidence → `ai.escalation.raised.v1` to a human (BC-1.AI), which is also the
      latency safety valve.
- [ ] **Co-locate** voice-gateway, Redis, and provider egress to minimize RTT; keep provider
      connections warm/pooled. Measure per-stage latency (STT partial, first LLM token, first TTS
      audio) and attribute regressions to a stage.
- [ ] **Sticky sessions** to one task for the call's life, with state checkpointed to Redis so a
      draining task hands off without dropping the call (ARCHITECTURE §12; §8 below).
- [ ] BC-3 Never-violate (perf-relevant): a dropped session must **not** lose the call record —
      checkpoint, don't rely on in-memory state.

---

## 3. Caching tiers (Redis / ElastiCache)

ARCHITECTURE §13: explicit TTL **plus** event-driven invalidation. Every key is tenant-prefixed
(`org:{id}:...` — see SECURITY §1). Caches are read-through; never a source of truth.

| Cache                       | Key shape                       | TTL                    | Invalidation                                                            |
| --------------------------- | ------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| Org config                  | `org:{id}:config`               | hours (rarely changes) | `org.profile.updated.v1`, `org.template.applied.v1`                     |
| AI-employee config          | `org:{id}:aiemployee:{id}`      | hours                  | `ai.employee.updated.v1`                                                |
| Identity resolution         | `org:{id}:identity:{channelId}` | minutes–hours          | `conversation.identity.merged.v1`, `crm.contact.merged.v1`              |
| KB retrieval results        | `org:{id}:kb:{embeddingHash}`   | minutes                | `kb.source.reindexed.v1`, `kb.ingestion.completed.v1` (for that source) |
| Rate-limit counters         | `org:{id}:ratelimit:{scope}`    | window length          | natural expiry                                                          |
| Session / reasoning session | `org:{id}:session:*`            | session/turn-bound     | explicit on revoke/end                                                  |

- [ ] **KB retrieval is keyed by query embedding hash**, not raw text — semantically-identical
      queries hit the same cache entry. Cache the `RetrievalResult` set (chunks + scores +
      citations), tenant-scoped.
- [ ] **Event-driven invalidation over short TTL.** Config caches can have long TTLs _because_ they
      bust on the relevant domain event (ARCHITECTURE §8 events). Don't paper over staleness with
      tiny TTLs that just thrash.
- [ ] **Never cache across tenants.** A cache helper without an `organizationId` in the key is a bug
      (and a security bug — SECURITY §1).
- [ ] **Stampede control:** singleflight / lock on expensive recomputes (KB retrieval, config
      assembly) so a cold key under load doesn't fan out N identical provider calls.
- [ ] Cache only idempotent, derivable data. Don't cache authoritative state you can't rebuild.

---

## 4. Database (Postgres + pgvector + FTS)

ARCHITECTURE §12: PgBouncer pooling, read replica for analytics, partition-ready high-volume tables.

- [ ] **Connection pooling via PgBouncer.** Fargate task count × Prisma pool exhausts Postgres
      connections fast. Cap Prisma pool per task; size PgBouncer (transaction mode) deliberately.
      Mind RLS GUC handling under transaction pooling (SECURITY §1.2) — `SET LOCAL`, not session `SET`.
- [ ] **Read replica for Analytics + heavy reads.** Dashboards/projections (BC-13) read from the
      replica; never aggregate over raw operational tables on the primary. Tolerate replica lag in
      read models (they're eventually-consistent by design).
- [ ] **No N+1 with Prisma.** Use `include`/`select` and batched queries; review generated SQL for
      list/timeline endpoints (Conversation timeline, lead lists, campaign rosters are prime offenders).
- [ ] **Pagination is mandatory** on every list endpoint (ARCHITECTURE §13). Prefer cursor/keyset
      pagination over `OFFSET` on high-volume tables.
- [ ] **Index for the hot queries:** every tenant-scoped query leads with `organizationId`; add
      composite indexes matching real access patterns (e.g. `(organizationId, leadId, createdAt)`
      for activities/timeline; `(organizationId, stage)` for pipeline views). Verify with `EXPLAIN`.
- [ ] **Partition-ready high-volume append tables:** `messages`, call `transcript` segments, and
      analytics events partition by time (and/or `organizationId`) per ARCHITECTURE §12. Design
      schemas and queries so partitioning is a migration, not a rewrite.
- [ ] **Append-only discipline:** messages/transcripts/audit are append-only (BC-2, BC-14) — exploit
      that for partition pruning and cheap archival of cold partitions.
- [ ] Keep transactions short (one aggregate per txn — DOMAIN_RULES global invariant #3); long txns
      hold connections and block.

### 4a. pgvector tuning + exit ramp

ARCHITECTURE §12/§15: start in-DB with HNSW; document the exit ramp.

- [ ] **HNSW index** on embeddings; tune `m` and `ef_construction` at build time, `ef_search` at
      query time (recall ↔ latency trade-off). Match the index distance op to the embedding metric.
- [ ] **Always pre-filter by `organizationId`** in the vector query predicate (recall + correctness +
      security — SECURITY §1.2). Validate that the planner uses the filter efficiently at scale.
- [ ] **Re-embed detection:** embeddings record model+version (BC-5 invariant); a model change
      triggers controlled re-index (`kb.source.reindexed.v1`), not silent mixed-dimension corpora.
- [ ] **Exit ramp:** `VectorIndex` is a port (BC-5). Move to a dedicated vector store (e.g.
      pgvector→managed ANN service) **when** in-DB recall@k or p95 retrieval latency degrades under
      growth, or vector index maintenance contends with OLTP. Trigger the migration on measured SLO
      breach, not vibes — the port means it's an adapter swap.

### 4b. Full-text search (transcripts)

- [ ] **Postgres FTS** powers `TranscriptSearch` (BC-8.Calls) and keyword side of hybrid KB
      retrieval. Maintain `tsvector` columns + GIN indexes; keep them tenant-scoped.
- [ ] Hybrid retrieval (pgvector semantic + FTS keyword + rerank — BC-5 `RetrievalService`) is the
      default; don't run vector-only on transcript/keyword-shaped queries.

---

## 5. Queue performance (BullMQ / Redis)

ARCHITECTURE §12: queues are shock absorbers; per-tenant fairness prevents noisy neighbors.

- [ ] **Per-queue concurrency** tuned to the bottleneck (CPU-bound embedding vs. provider-bound
      outreach differ). One worker image, multiple queue-bound process types (ARCHITECTURE §1).
- [ ] **Per-tenant fairness / rate limiting.** A 50k-lead campaign import or webhook storm from one
      org must not starve others (ARCHITECTURE §12 noisy-neighbor). `CampaignOrchestrator` /
      `FollowUpEngine` enforce per-org rate limits; consider per-tenant queues or weighted/round-robin
      consumption so no single `organizationId` monopolizes workers.
- [ ] **Provider rate limits drive queue rate limits.** WhatsApp/Twilio/OpenAI/ElevenLabs quotas are
      enforced at the queue layer so we throttle ourselves before the provider 429s us (§7).
- [ ] **Backpressure:** bound queue depth + alarm on growth; shed/defer low-priority work under load.
      Producers (webhook adapters) stay thin and fast (ARCHITECTURE §7) so ingestion never blocks on
      processing.
- [ ] **Batch embeddings.** Ingestion (`IngestionPipeline`, BC-5) batches chunk embeddings into
      provider calls rather than one call per chunk — throughput + cost (§7).
- [ ] **Idempotent handlers** (at-least-once delivery, ARCHITECTURE §8; BC-4 at-most-once-per-step):
      dedupe by event/job id so retries don't double-send outreach or double-charge providers.
- [ ] **Separate priority lanes** for latency-sensitive async (e.g. notification of a human
      escalation) vs. bulk (CSV import, re-index).

---

## 6. Frontend performance (Next.js dashboards)

- [ ] **React Server Components** for data-heavy dashboard views; minimize client JS.
- [ ] **Code-split per feature** so the conversation inbox doesn't ship the analytics bundle, etc.
- [ ] **Data loading:** fetch on the server, paginate, stream where it helps perceived latency; never
      block first paint on a slow aggregate.
- [ ] **Optimistic UI for chat:** render the outbound message immediately, reconcile on
      `conversation.message.appended.v1`; show AI typing/working state during the reasoning turn.
- [ ] **Realtime via WS** (presence, live timeline, agent status, notifications) — see §8; avoid poll
      loops that hammer the API.
- [ ] Cache static/config-ish GETs at the edge where tenant-safe; respect cache headers.

---

## 7. Third-party cost & rate management

ARCHITECTURE §15 top risk: cost blowup + throttling across OpenAI / Twilio / ElevenLabs / WhatsApp.
Providers sit behind ports (BC adapters) so we can throttle, cache, and swap.

- [ ] **Quota-aware throttling at the queue** (§5) for every provider; back off on 429 with jitter.
- [ ] **Token cost telemetry.** `ai.reasoning.completed.v1` carries tokens (BC-1.AI); aggregate per
      org/employee/campaign and feed **CPL / ROAS** analytics (BC-13, ARCHITECTURE §13). Emit usage
      events now even pre-billing (ARCHITECTURE §16 — future Billing consumes history).
- [ ] **Per-tenant cost/usage caps & alarms** so one tenant (or a prompt-injection cost-DoS — SECURITY
      §9) can't run up an unbounded provider bill. Hard-stop + alarm at threshold.
- [ ] **Cache prompts / retrieval / partial reasoning** (§3) to cut redundant LLM/embedding calls;
      use provider prompt-caching where available for the stable persona/system prefix (deterministic
      assembly — BC-1.AI — makes the prefix cacheable).
- [ ] **Right-size models per task** (`LanguageRouter`/provider routing — BC-1.AI, ARCHITECTURE §16):
      cheaper/faster models for classification/routing, premium models only where quality is core
      (regional-language voice). Route by language/cost/latency policy.
- [ ] **Batch + dedupe** outbound provider work (embeddings §5; notification fan-out BC-12).

---

## 8. WebSocket & realtime scaling

ARCHITECTURE §7/§12: stateless api/web scale horizontally; voice-gateway scales on concurrent calls.

- [ ] **Redis pub/sub fan-out.** Workers/api publish to tenant channels (`org:{id}:...`); the WS
      gateway subscribes and fans out to the right tenant rooms — so any api instance can deliver to
      any connected client regardless of which instance holds the socket.
- [ ] **No in-memory session state on api/web** (ARCHITECTURE §12). Sessions in Redis/JWT; WS instances
      are interchangeable behind the ALB.
- [ ] **Voice sessions are sticky** to a voice-gateway task for the call's life, with state
      **checkpointed to Redis** so a draining/replaced task hands off mid-call without a drop
      (ARCHITECTURE §12; §2). This is the deliberate exception to statelessness.
- [ ] **Scale signals:** api/web on CPU/request count; voice-gateway on **concurrent active calls**;
      workers on **queue depth per queue** (ARCHITECTURE §1). Don't autoscale voice on CPU alone.
- [ ] Bound WS message size; rate-limit per connection; tenant-scope every room join (SECURITY §1.2).

---

## 9. Load & performance testing

- [ ] **Voice latency harness** measuring per-stage and end-to-end turn latency under concurrent
      calls; gate releases on the < 1.2s p95 SLO. This is the most important test we run.
- [ ] **Text conversation load test** (webhook → reply) against the < 2s p95 budget, including a
      cold-cache scenario.
- [ ] **Soak / spike tests** for the queue shock-absorber path: simulate a 50k-lead import + webhook
      storm and assert per-tenant fairness holds (no starvation).
- [ ] **DB load tests** with realistic data volumes for pagination, vector recall@k + latency, and
      FTS; run `EXPLAIN` on the hot queries in CI where feasible.
- [ ] **Cost regression checks:** track tokens/turn and provider calls/turn so a refactor that
      doubles LLM calls is caught before prod.

---

## 10. SLOs & alerting

Observability spans everything: CloudWatch (metrics/logs/alarms) + Sentry (errors/traces),
ARCHITECTURE §1.

**SLOs (alarm on breach):**

- [ ] Voice turn latency p95 < 1.2s (and per-stage: first-STT-partial, first-LLM-token, first-TTS-audio).
- [ ] Text conversation latency p95 < 2s.
- [ ] API p95 latency + error rate per route; WS connect/delivery latency.
- [ ] Worker queue depth + oldest-job-age per queue (backpressure signal).
- [ ] DB: connection saturation (PgBouncer), replica lag, slow-query rate, pgvector retrieval p95.
- [ ] Cache hit ratio per tier (a sudden drop = invalidation bug or stampede).
- [ ] Provider error/429 rate + per-tenant cost burn vs. cap.

**Alarm on (the "system is degrading/broken" signals):**

- [ ] Voice turn p95 trending toward 1.2s, or call-drop / failed-handoff rate up.
- [ ] Queue depth growing unbounded; DLQ growth; oldest-job-age past threshold.
- [ ] Per-tenant fairness breach (one org consuming disproportionate worker time).
- [ ] Provider throttling / cost cap approaching.
- [ ] Cache hit ratio collapse; DB connection exhaustion; replica lag spike.
- [ ] `WorkflowFailure` / escalation notifications failing to deliver (BC-12 Never-violate — these
      are the "the system is broken" signals; they must never be silently dropped).

---

## PERFORMANCE REVIEW CHECKLIST (for every PR)

**Latency budgets**

- [ ] Does this touch the voice loop? If so, it streams (STT partials → LLM on partials → streaming
      TTS), never waits for full transcript, and was measured against the 1.2s p95 budget.
- [ ] Does this touch the text conversation path? Measured against the 2s p95 budget.
- [ ] No new variable-latency third-party call added to a user-waiting/turn path that should be a queue job.

**Caching**

- [ ] New cacheable reads use the right Redis tier with explicit TTL **and** event-driven invalidation.
- [ ] Every cache key is `org:{id}:`-prefixed (no cross-tenant cache).
- [ ] KB retrieval cached by embedding hash; stampede control on expensive recomputes.

**Database**

- [ ] No N+1 (reviewed generated SQL for any new list/timeline query).
- [ ] Pagination on every new list endpoint (cursor/keyset on high-volume tables).
- [ ] Indexes added/verified (`EXPLAIN`) for new hot queries; `organizationId`-leading.
- [ ] High-volume new tables are partition-ready; transactions stay short (one aggregate).
- [ ] Analytics/heavy reads target the read replica, not the primary.
- [ ] pgvector queries pre-filter by org; HNSW params considered; FTS uses GIN.

**Queues**

- [ ] Per-queue concurrency set; handler idempotent (dedupe by job/event id).
- [ ] Per-tenant rate limiting / fairness preserved (no noisy-neighbor regression).
- [ ] Provider-bound work is quota-throttled at the queue; embeddings/fan-out batched.

**Frontend**

- [ ] RSC + per-feature code-split where applicable; paginated server data loading.
- [ ] Chat changes keep optimistic UI; realtime via WS, not polling.

**Cost & realtime**

- [ ] Token/provider-call cost per turn not silently increased; usage telemetry emitted (feeds CPL/ROAS).
- [ ] Per-tenant cost cap respected; model right-sized for the task.
- [ ] New realtime fan-out goes through Redis pub/sub to tenant rooms; no in-memory session state on api/web.

**SLO/observability**

- [ ] New hot path emits the metrics needed to watch its SLO; relevant alarms added/updated.
