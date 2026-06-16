# ADR-0005: Run voice in a separate `voice-gateway` service, split from `apps/api`

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Principal Architect, Voice context owner, Platform team
- **Tags:** voice, realtime, scaling, fault-isolation, architecture

---

## Context

Voice / Telephony is a **core** context ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §3, BC-3):
the make-or-break "was that a person or AI?" experience. Its end-to-end turn latency budget is
**< 1.2s p95** (user stops speaking → AI audio starts) — the strictest budget in the system,
achieved only by streaming STT partials, starting the LLM on partials, and streaming TTS, never
waiting for full transcription ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §13).

This runtime profile is *fundamentally different* from the rest of the API. Voice sessions are
**long-lived, stateful, latency-critical WebSocket/media streams** (`VoiceSession`,
`MediaStreamRef`, the realtime STT↔LLM↔TTS loop — [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-3).
`apps/api` by contrast serves short, stateless REST/WS request-response traffic and is
redeployed routinely. Co-locating them would mean a routine API deploy kills active calls
mid-conversation, and that voice load and API load — which scale on completely different
signals — must scale as one unit. This is exactly trigger #1 ("divergent runtime profile") and
trigger #3 ("fault isolation") of the extraction rule in
[ADR-0002](0002-modular-monolith-over-microservices.md).

## Decision

**We will run the realtime voice loop in a separate deployable service, `apps/voice-gateway`,
from day one — while keeping the Voice *domain* (call lifecycle) as a context module and
reusing the shared application code, so this is a deployment split, not a logic fork.**

- **`apps/voice-gateway`** owns the long-lived realtime sessions: media stream handling and the
  STT↔LLM↔TTS orchestration loop ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §1, §2).
- It does **not** duplicate domain logic. It consumes the Voice context's application services
  and calls back into the same application layer for AI Employee reasoning and KB/CRM search,
  exactly as `apps/api` does ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §7;
  [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §2, §4 — "Duplicated domain logic;
  CRM/KB tables direct" is forbidden in `apps/voice-gateway`). The Voice domain lives in
  `contexts/voice/`; the *live loop* runs in voice-gateway.
- Post-call work (transcription finalization, summary, sentiment, CRM auto-update) is **not**
  done inline in the voice loop — voice-gateway enqueues BullMQ jobs drained by `apps/workers`
  ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §7, §9), keeping the realtime path lean.
- **Scaling & resilience** ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §12): voice-gateway scales
  on **concurrent active calls**; sessions are sticky to a task for their lifetime, with state
  checkpointed to Redis so a draining task can hand off rather than drop a call. This honors the
  Voice never-violate rule that "a dropped session must not lose the call record" and "transfer
  to human must never silently fail" ([`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-3).

## Consequences

- **Positive:**
  - Routine `apps/api` deploys cannot kill in-flight calls — the latency-critical, stateful path
    is isolated from the churny request-response path.
  - Voice scales independently on its true signal (concurrent calls) instead of dragging the
    whole API up and down.
  - A voice incident is contained; the rest of the platform keeps serving.
  - Because it reuses context app services, there is no second copy of business logic to keep in
    sync — consistent with the modular-monolith reuse rule.
- **Negative / accepted trade-offs:**
  - Two backend deployables instead of one: extra Dockerfile, ECS service, dashboards, and
    deploy/rollback choreography.
  - Session stickiness + Redis checkpointing is real complexity (graceful draining, handoff)
    that a co-located design would not need.
  - Shared application packages must stay binary/contract-compatible across api and
    voice-gateway deploys.
- **Follow-ups / obligations:**
  - Runbook for draining/handoff and for "voice is degraded → fall back to human handoff"
    ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §15 mitigation).
  - Strict voice-latency SLOs monitored (CloudWatch) with alarms.

## Alternatives considered

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **Voice inside `apps/api`** | One fewer service; simplest ops | API deploys kill live calls; can't scale voice independently; latency budget at risk; blast radius shared | ❌ rejected — violates extraction triggers #1 and #3 |
| **Voice as a job in `apps/workers`** | Reuses queue infra | Queues are for async, retryable, non-latency-critical work; a realtime streaming loop is none of those ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §9) | ❌ rejected — wrong execution model for sub-second streaming |
| **Separate `voice-gateway` service reusing context app code (chosen)** | Isolated deploy/scale/fault profile; no duplicated logic | Extra deployable; stickiness/checkpoint complexity | ✅ **chosen** |

## Related

- Docs: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §1 (deployables), §2, §7, §9, §12, §13, §15;
  [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-3 (Voice & Calls);
  [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §2, §4.
- ADRs: [ADR-0002](0002-modular-monolith-over-microservices.md) (the extraction-trigger rule
  this applies); [ADR-0006](0006-event-bus-and-outbox.md) (post-call work via outbox → BullMQ).
