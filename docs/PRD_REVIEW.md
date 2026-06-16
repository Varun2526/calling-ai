# Propulse AI — PRD Review & Recommendations (Phase 9)

> **Owner:** Principal Architect + Product · **Update frequency:** when the PRD changes or a
> flagged item is resolved (link the resolving ADR). This is a **critical** review of
> [`prd/CALLING_AI_V1.md`](prd/CALLING_AI_V1.md). It does **not** change the core vision — it
> surfaces gaps, ambiguities, hidden assumptions, and risks so they're decided deliberately,
> not by accident. Each item has a **severity** and a **recommendation**.

Severity: 🔴 blocker (must resolve before the related feature ships) · 🟠 important (resolve
during the phase) · 🟡 watch (track, decide later).

---

## 1. Missing requirements

| # | Gap | Severity | Recommendation |
|---|---|---|---|
| M1 | **Consent, DNC, and call-recording legality.** Outbound autonomous calling + recording in India is governed by TRAI/DLT regulations and the **DPDP Act 2023**; recording requires disclosure/consent. The PRD has no consent capture, opt-out registry, calling-window, or recording-announcement requirements. | 🔴 | Add a Consent/DNC sub-domain (or fields on Contact): consent state, opt-out, DNC list, allowed calling windows, recording announcement. **Block outbound (Phase 2) until shipped.** |
| M2 | **Data retention & deletion (data-subject rights).** No policy for how long recordings/transcripts/PII are kept or how a person's data is deleted on request. | 🔴 | Define retention windows per data class + a deletion workflow honoring DPDP data-principal rights; tenant-configurable. |
| M3 | **AI disclosure.** The goal is "buyers can't tell it's AI", but many jurisdictions require disclosure that the caller is automated. The PRD is silent — this is a legal *and* ethical decision. | 🔴 | Make AI-disclosure a configurable, default-on policy; get legal sign-off per region. Document the decision in an ADR. |
| M4 | **Billing / usage metering.** Platform is "internal first" but there's no usage accounting (calls, minutes, messages, tokens, embeddings) — needed for cost control now and billing later. | 🟠 | Emit usage/cost events from day one (already in roadmap Phase 0) even without a Billing context. |
| M5 | **SLAs / availability targets.** No uptime, latency, or delivery SLAs stated. Voice especially needs them. | 🟠 | Define SLOs (see PERFORMANCE_GUIDELINES): API p95, voice turn <1.2s, message delivery, ingestion time. |
| M6 | **Human-agent calendar/availability source.** Appointment "executive assignment" and assignment strategies assume availability data that isn't specified. | 🟠 | Define executive availability model + working-hours source (org business hours + per-user calendar). |
| M7 | **Conversation context window / memory limits.** "Remember context" is unbounded in the PRD; LLMs have token limits and long histories cost money. | 🟠 | Define a memory strategy: structured CRM memory (durable) + summarized rolling conversation memory + retrieval of older turns. |
| M8 | **WhatsApp template/24-hour-window rules.** WhatsApp Business API restricts business-initiated messages to approved templates outside a 24h customer-care window. Outbound nurture/follow-up is directly constrained. | 🔴 | Model approved templates + opt-in; design follow-up engine around the 24h window + template policy. |
| M9 | **Idempotency & exactly-once expectations.** PRD describes flows as if linear/once; reality is at-least-once events + retried webhooks. Not stated. | 🟠 | (Already designed: outbox + idempotent handlers.) Make idempotency keys a documented requirement on all webhooks/mutations. |
| M10 | **Migration/import data quality.** "Import leads / CSV" assumes clean data; no validation, mapping, or error-handling spec. | 🟡 | Define import schema mapping, validation, partial-failure reporting, and dedup rules. |
| M11 | **Accessibility & i18n of the dashboards** (not just the AI). | 🟡 | Add WCAG target + dashboard localization scope. |

## 2. Ambiguities (need a decision)

| # | Ambiguity | Recommendation |
|---|---|---|
| A1 | **"Contact" vs "Lead" relationship** is implied but not defined. One person, many opportunities? | We define: Contact = person (deduped); Lead = opportunity; 1 Contact → N Leads. (See DOMAIN_RULES.) Confirm with product. |
| A2 | **"Memory" scope** — per AI employee, per org, or per contact? | Memory is per-Contact (durable CRM facts) + per-Conversation (rolling). AI employee config is separate. Confirm. |
| A3 | **"Lead Scoring automatically updated"** — what triggers and what weights? | Scoring is event-driven + org-configurable weights; thresholds Cold/Warm/Hot configurable. Confirm default weights with product. |
| A4 | **Multiple AI employees per org?** PRD says "an AI employee" (singular) but templates + departments imply many. | Support N AI employees per org from the start (config aggregate). Confirm. |
| A5 | **"Human transfer" during a live call** — to a ringing phone, a queue, or async callback? | MVP: notify + async callback / warm handoff where a human is available; live PSTN transfer is Phase 2. Confirm. |
| A6 | **Pipeline configurability scope** — per org, per template, per AI employee? | Per org (seeded by template). Confirm. |
| A7 | **"Enrich Data" in campaigns** — enrich from what source? | Unspecified third-party enrichment. Treat as pluggable port; MVP may be a no-op. Confirm vendor. |
| A8 | **Languages: which are MVP?** 10 languages + code-switching is a large quality surface. | MVP: English + Hindi + Telugu (high-value for real estate in target markets); expand in Phase 2. Confirm. |
| A9 | **"Real-time" voice definition** — barge-in/interruptions in MVP or later? | Inbound near-realtime in MVP; full barge-in/interruptions Phase 2 (see ROADMAP risk note). Confirm. |
| A10 | **Who owns the phone numbers / WhatsApp numbers** — platform or client? | Per-tenant numbers provisioned during onboarding; ownership/billing TBD. Confirm. |

## 3. Hidden assumptions (surface and validate)

- **H1:** The LLM can sustain "better than an average pre-sales executive" reliably across 10
  languages + code-switching. This is the product's biggest bet — assumes model quality +
  prompt/RAG engineering can hit it. *Mitigation:* per-language eval harness + human-review
  loop; don't assume, measure.
- **H2:** Sub-1.2s realtime voice is achievable through the Twilio→Deepgram→LLM→ElevenLabs
  chain at acceptable cost. *Mitigation:* spike + measure in Phase 6 before committing Phase 2
  scope; have a fallback UX.
- **H3:** "Deploy in < 30 minutes" assumes brochures/pricing are clean and ingestion is fast,
  and that WhatsApp/phone connection is instant — but WhatsApp/BSP approval can take days.
  *Mitigation:* the *configuration* is < 30 min; provider approvals are a separate, pre-started
  track. Set expectations explicitly.
- **H4:** Single Postgres handles OLTP + pgvector + FTS + analytics at target volume.
  *Mitigation:* read replica + documented extraction ramps (ARCHITECTURE §12).
- **H5:** "Never miss a follow-up" assumes reliable scheduling — depends on queue/outbox
  reliability and the WhatsApp 24h window. *Mitigation:* designed via outbox + DLQ + alarms.
- **H6:** Identity resolution across phone/email/WhatsApp is reliable. *Mitigation:* prefer
  no-merge over false-merge; manual merge UI for ambiguous cases.
- **H7:** Cost per conversation/call is economically viable at scale (LLM + STT + TTS +
  telephony). *Mitigation:* cost telemetry feeding CPL/ROAS from day one; caching; model
  routing.

## 4. Technical risks

| Risk | Likelihood | Impact | Mitigation (see ARCHITECTURE §15 / DECISION_LOG) |
|---|---|---|---|
| Realtime voice latency/quality misses the "is it human?" bar | High | Core value | Dedicated voice-gateway, streaming pipeline, strict SLOs, phased scope, fallback handoff |
| LLM hallucination on price/inventory/legal claims | High | Trust + legal | RAG grounding + citations, guardrails, confidence escalation, eval harness |
| Multi-tenant data leak | Low (if disciplined) | Catastrophic | Defense-in-depth + blocking cross-tenant CI tests |
| Third-party cost blowup / rate limits | Medium | Cost + outages | Per-tenant rate limiting, caching, cost telemetry, provider abstraction |
| Modular-monolith boundary erosion | Medium | Future agility | Lint-enforced boundaries + architecture fitness tests + ADR discipline |
| Regional language / code-switch quality | Medium-High | Differentiator | Per-language eval sets, model routing, human review |
| Event/idempotency bugs causing double actions (double-booking, double-call) | Medium | Trust | Idempotent handlers, dedupe keys, at-most-once outreach per step |

## 5. Compliance concerns

- **DPDP Act 2023 (India):** consent, purpose limitation, data-principal rights (access,
  correction, erasure), breach notification, data-residency expectations. 🔴 for any PII +
  outbound.
- **TRAI / DLT & telemarketing rules:** registered sender, consent, DND/DNC scrubbing, calling
  windows for outbound voice/SMS. 🔴 for outbound.
- **WhatsApp Business Policy:** opt-in, template approval, 24h window, no spam. 🔴 for
  outbound/follow-up.
- **Call recording disclosure:** announce/obtain consent before recording. 🔴.
- **AI disclosure laws (varies by region):** may legally require revealing the caller is AI —
  directly tensions with the "can't tell it's AI" goal. 🔴 — needs legal decision + ADR.
- **PCI:** out of scope *unless* payments are added later (booking deposits) — flag for future.

## 6. Scalability concerns

- Single DB as OLTP + vector + FTS + analytics source — mitigated with read replica +
  partitioning roadmap + extraction ramps.
- Voice concurrency scaling (stateful long-lived sessions) — voice-gateway scales on active
  calls with Redis-checkpointed sessions.
- Large campaign imports (50k+ leads) and webhook storms — absorbed by queues with per-tenant
  fairness so one tenant can't starve others.
- Vector index growth — HNSW tuning + documented exit to a dedicated vector store.

## 7. Security concerns

- Heavy PII (recordings/transcripts/phones/budgets) — encryption at rest/in transit,
  tenant-scoped S3 prefixes + signed short-lived URLs, least-privilege IAM.
- Webhook authenticity (Twilio/WhatsApp/Meta/Google signatures, replay protection).
- **Prompt injection** via user-supplied content and KB documents (an attacker uploads a doc
  that tries to hijack the agent's tool use) — guardrails, tool-grant enforcement, never let a
  prompt cross tenants. Detailed in SECURITY_GUIDELINES.
- No public signup reduces surface but invitation tokens must be airtight.

## 8. Operational concerns

- **Vendor dependency concentration:** OpenAI/Deepgram/ElevenLabs/Twilio/WhatsApp outages or
  policy changes directly degrade the product. *Mitigation:* provider abstraction ports + at
  least a documented fallback per capability + status monitoring.
- **Observability of autonomous actions:** because the AI takes real actions (books visits,
  messages customers), every action must be traceable, auditable, and reversible. *Mitigation:*
  ai.action.* events + audit log + action grants.
- **Human handoff reliability** under load and after hours — define on-call/availability and
  fallback (callback) behavior.
- **Cost observability** — real-time per-tenant cost dashboards to catch runaway spend early.
- **On-call & runbooks** — queue backlog, third-party outage, tenant-leak, voice degradation
  runbooks (see `runbooks/`).

## 9. Recommendations summary (without changing the vision)

1. **Ship inbound (text + basic voice) first; outbound realtime voice in Phase 2** — validate
   the brain before the hardest, riskiest, most regulated capability. (Reflected in ROADMAP.)
2. **Treat compliance (consent/DNC/recording/AI-disclosure/DPDP/WhatsApp) as a feature with
   its own DoD**, gating outbound — not an afterthought.
3. **Build the eval harness early** (per-language, RAG-grounding, action-correctness) — "feels
   human" and "doesn't hallucinate" must be measured, not asserted.
4. **Emit usage/cost events from day one** so billing, ROAS/CPL, and cost guardrails are
   possible without rework.
5. **Confirm the ambiguities (§2) with product** before the relevant phase; default to the
   recommendations above to keep moving.
6. **Keep real-estate specifics in the template/config layer** so the platform generalizes to
   new verticals without forks.

None of the above changes *what* Propulse AI is — they make the *how* deliberate, legal, and
measurable.
