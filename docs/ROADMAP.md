# Propulse AI — Implementation Roadmap (Phase 8)

> **Owner:** Eng Manager + Principal Architect · **Update frequency:** end of every phase /
> sprint review. Constraints honored: do not violate the established architecture; work
> incrementally; prioritize business value; avoid unnecessary complexity; ship an **internal
> production MVP in 12 weeks**. "Internal production" = our Ops team can deploy a real
> client's AI employee and run real leads; not yet public self-serve.

---

## How to read this

Each phase lists **Goals · Features · Dependencies · Folder locations · Docs to update ·
Testing strategy · Risks · Definition of Done**. Phases are sequenced so each builds only on
shipped capabilities. Folder locations reference [`REPOSITORY_STRUCTURE.md`](REPOSITORY_STRUCTURE.md).

**Scope summary**

| Tier                      | What                                                                                                                                                                                                                                                                                   | When       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| **MVP (Weeks 1–12)**      | Platform skeleton, IAM/tenancy, Org+templates, KB ingestion+RAG, AI Employee, **WhatsApp + Website chat** inbound, Conversation Engine, CRM + qualification + scoring + assignment, Appointments, Notifications, basic Analytics, client + admin dashboards, **inbound voice (basic)** | Weeks 1–12 |
| **Phase 2 (Weeks 13–24)** | Outbound campaign engine, follow-up engine, advanced voice (realtime, interruptions, transfer), transcript intelligence/search, full multilingual + code-switching, Meta/Google lead-form + CSV import, richer analytics (CPL/ROAS)                                                    | post-MVP   |
| **Future enterprise**     | Service extraction (voice first), data warehouse/BI, public self-serve + billing, new verticals via templates, advanced ABAC, SSO/SCIM, on-shore data residency options                                                                                                                | later      |

> **Critical sequencing note:** the PRD's marquee feature ("AI so natural buyers ask _was that
> a person?_") is **realtime outbound voice**, which is the highest-risk, highest-latency
> component. We deliberately ship **text channels + inbound voice** in the MVP to validate the
> AI Employee brain, RAG grounding, and CRM loop _first_, then invest in realtime voice in
> Phase 2 once the reasoning/grounding/eval foundation is proven. See risks below.

---

## Phase 0 — Foundations (Week 1–2)

- **Goals:** a deployable skeleton with the architecture's guardrails _live_ before any
  feature code, so boundaries can't rot.
- **Features / deliverables:**
  - Monorepo bootstrap: Turborepo + pnpm workspaces, `tsconfig.base`, `turbo.json`.
  - `packages/`: `domain-kernel` (OrganizationId, Money, E164Phone, Result, base AggregateRoot/
    DomainEvent), `contracts` (zod skeleton), `config` (env validation), `database` (Prisma init
    - tenant middleware skeleton + RLS scaffolding), `observability`, `eslint-config` (with
      boundary rules), `ui` (shadcn init), `testing`.
  - `apps/api` NestJS skeleton with `shared/` (tenant context, guards, event bus, **outbox**),
    empty context modules registered.
  - `apps/web` Next.js skeleton (App Router, route groups, auth-accept shell).
  - `apps/workers` BullMQ skeleton + outbox relay processor. `apps/voice-gateway` skeleton.
  - CI: lint/typecheck/test/**boundaries (dependency-cruiser)** + domain-purity grep +
    architecture fitness test. `docker-compose` local stack. `infra/` IaC skeleton.
- **Dependencies:** none.
- **Folder locations:** root, `packages/*`, `apps/*/src` skeletons, `.github/workflows`, `infra/`.
- **Docs to update:** `ONBOARDING_GUIDE` (verify commands work), `DEPLOYMENT_GUIDE` (pipeline),
  `DECISION_LOG` (record any deviations).
- **Testing:** CI green; the architecture fitness test passes; a trivial end-to-end "ping"
  request flows web→api→db; one sample event flows through outbox→worker.
- **Risks:** over-engineering the skeleton. Mitigation: build only the guardrails listed; no
  speculative abstractions.
- **DoD:** `pnpm install && pnpm dev` runs all apps locally against docker-compose; CI enforces
  all boundary rules; an empty PR fails if it violates a layer boundary (proven with a
  deliberate test violation).

## Phase 1 — Identity, Tenancy & Organization (Week 2–3)

- **Goals:** secure multi-tenant backbone + the org that everything hangs off.
- **Features:** IAM (admin-created orgs, invitation flow, sessions, RBAC + CASL abilities,
  **no public signup**); tenant context guard + Prisma middleware + Postgres RLS **proven by
  cross-tenant isolation tests**; Organization profile (company, hours, timezone, country,
  languages, brand colors); audit log (Platform Ops, append-only); super-admin shell.
- **Dependencies:** Phase 0.
- **Folder locations:** `contexts/iam`, `contexts/organization`, `contexts/platform-ops`,
  `shared/` guards/middleware, `packages/database` (RLS policies), `apps/web/app/(auth)` + `(admin)`.
- **Docs to update:** `SECURITY_GUIDELINES` (verify), `API_CONTRACTS` (auth/org endpoints),
  `EVENT_CATALOG` (iam._/org._ events), ADR-0001/0003 confirmations.
- **Testing:** **cross-tenant access tests are mandatory and blocking**; RBAC policy unit
  tests; invitation token lifecycle tests; e2e login/accept-invite.
- **Risks:** tenant-leak bug. Mitigation: defense-in-depth + CI isolation suite from day one.
- **DoD:** Ops admin can create an org, invite a Client Owner, who logs in and sees only their
  org's (empty) dashboard; a test proving tenant B cannot read tenant A's data is green.

## Phase 2 — Knowledge Base & RAG (Week 3–5)

- **Goals:** grounded knowledge so the AI doesn't hallucinate property facts.
- **Features:** source upload (PDF/brochure/pricing/FAQ/URL/text/doc) to S3; async ingestion
  pipeline (extract→clean→chunk→embed→index) in workers; pgvector store + Postgres FTS hybrid
  retrieval + citations; KB management UI; reindex on model change.
- **Dependencies:** Phase 0–1 (tenant scoping for chunks/embeddings).
- **Folder locations:** `contexts/knowledge-base`, `apps/workers/src/processors` (ingest,
  embed), `apps/web/features/knowledge-base`, S3 prefixes `org/{id}/...`.
- **Docs to update:** `EVENT_CATALOG` (kb.\*), `PERFORMANCE_GUIDELINES` (pgvector/embedding
  batching), feature-spec.
- **Testing:** ingestion idempotency (no duplicate chunks), tenant-filtered retrieval test,
  retrieval relevance smoke eval set.
- **Risks:** retrieval quality. Mitigation: hybrid retrieval + a small eval set per source type.
- **DoD:** upload a brochure → it's chunked/embedded/indexed → a retrieval query returns
  grounded, cited chunks for that org only.

## Phase 3 — AI Employee + Conversation Engine + Website Chat (Week 5–7)

- **Goals:** the **core brain** working over a real text channel with unified memory.
- **Features:** AI Employee config (identity/personality/permitted actions/escalation/goals);
  PromptAssembler + ReasoningOrchestrator (LLM port) + ActionDispatcher (grant-checked);
  Conversation Engine (timeline, identity resolution, control state); **Website Chat** channel
  - WebSocket live updates; action set wired to events (CreateLead/SearchKnowledge/SearchCRM/
    Escalate); confidence-based escalation/handoff.
- **Dependencies:** Phase 1–2.
- **Folder locations:** `contexts/ai-employee`, `contexts/conversation`, `contexts/channels`,
  `apps/web/features/conversations` + `ai-employee`, WS gateway in `apps/api`.
- **Docs to update:** `EVENT_CATALOG` (conversation._, ai._), `API_CONTRACTS` (WS contract),
  `AI_AGENT_GUIDELINES`, feature-spec.
- **Testing:** deterministic prompt-assembly unit tests; reasoning orchestrator with a stubbed
  LLM; identity-resolution merge/no-false-merge tests; e2e website chat conversation.
- **Risks:** false identity merges; ungrounded answers. Mitigation: conservative resolver +
  RAG grounding + escalation on low confidence.
- **DoD:** a visitor chats on a test site, the AI answers from KB with citations, remembers
  context across messages, and escalates to a human when configured.

## Phase 4 — CRM, Qualification, Scoring, Assignment (Week 7–9)

- **Goals:** turn conversations into a managed sales pipeline.
- **Features:** Contacts/Leads/Pipeline/Activities; configurable qualification questions
  captured in-conversation; ScoringEngine (Cold/Warm/Hot, explainable); assignment strategies
  (RoundRobin/Manual/Location/Project/Fallback — **no lead unassigned**); CRM auto-update from
  AI actions; lead/contact dashboards.
- **Dependencies:** Phase 3 (events from conversation/AI).
- **Folder locations:** `contexts/crm`, `contexts/qualification`, `apps/web/features/leads`.
- **Docs to update:** `EVENT_CATALOG` (crm._, qualification._, leadscore.\*), `DOMAIN_RULES`
  confirmations, feature-spec.
- **Testing:** scoring engine pure unit tests + explainability; assignment fallback test
  (guarantee no unassigned); pipeline transition legality tests.
- **DoD:** an inbound chat produces a deduped Contact + scored Lead, auto-assigned to an
  executive, visible in the client dashboard with full activity timeline.

## Phase 5 — Appointments + Notifications + WhatsApp inbound (Week 9–10)

- **Goals:** close the inbound loop end-to-end (the PRD "Primary Inbound Journey").
- **Features:** Appointments (site visit/virtual/phone), booking/reschedule/cancel, reminders,
  exec assignment, Google Maps; Notification engine (in-app/email/WhatsApp) on the PRD events;
  **WhatsApp Business API** inbound channel into the same Conversation Engine + identity
  resolution.
- **Dependencies:** Phase 3–4.
- **Folder locations:** `contexts/appointments`, `contexts/notifications`,
  `contexts/channels` (WhatsApp adapter), `apps/web/features/appointments`, workers (reminders,
  notification delivery).
- **Docs to update:** `EVENT_CATALOG` (appointments._, notifications._), `SECURITY_GUIDELINES`
  (WhatsApp webhook signatures), feature-spec `0001` realized.
- **Testing:** webhook signature verification tests; no double-booking; reminder scheduling
  reliability; e2e WhatsApp → lead → booked visit → confirmation.
- **Risks:** WhatsApp template/approval + provider setup lead time. Mitigation: start provider
  onboarding in Week 1 (long pole).
- **DoD:** full inbound journey works on WhatsApp: lead arrives → AI qualifies → lead
  created/scored/assigned → site visit booked → confirmation sent → CRM + analytics updated.

## Phase 6 — Templates, Onboarding Wizard, Inbound Voice (basic), Analytics v1 (Week 10–12)

- **Goals:** the **< 30-minute deploy** promise + first voice capability + visibility.
- **Features:** Real-estate templates (Developer/Builder/Broker/Agency/Individual) that
  provision pipeline/AI employee/questions/follow-up/notifications/dashboards/campaign
  templates/appointment rules via the template saga; onboarding wizard; **inbound voice
  (basic)**: Twilio number → Deepgram STT → AI reasoning → ElevenLabs TTS, in `apps/voice-
gateway`, with recording → transcript → summary → CRM auto-update (async); Analytics v1
  (leads captured, conversations, appointments, conversion, response time, hot leads, agent
  perf) via read models.
- **Dependencies:** all prior phases.
- **Folder locations:** `contexts/organization` (templates/onboarding), `apps/voice-gateway`,
  `contexts/voice` + `contexts/calls`, `contexts/analytics`, `apps/web/features/onboarding` +
  `analytics`, workers (transcription, summary, analytics projections).
- **Docs to update:** `EVENT_CATALOG` (calls.\*, analytics), `PERFORMANCE_GUIDELINES` (voice
  latency), `DEPLOYMENT_GUIDE` (voice-gateway specifics), ADR-0005 realized, feature-specs.
- **Testing:** template-application idempotency/saga re-drive; voice call e2e (inbound) with
  latency measurement; transcript/summary→CRM mapping tests; analytics projection rebuild test.
- **Risks:** **voice latency/quality** (top risk). Mitigation: scope MVP voice to _inbound,
  near-realtime_ with strict latency telemetry; treat full realtime barge-in as Phase 2;
  fallback to human handoff.
- **DoD:** Ops can stand up a new client org from a template, upload docs, connect WhatsApp +
  a phone number, and go live in < 30 min; an inbound call is handled, recorded, transcribed,
  summarized, and updates the CRM; the client sees analytics.

### ⛳ MVP COMPLETE (end of Week 12)

Inbound is fully autonomous across **website chat + WhatsApp + basic voice**, grounded in KB,
producing scored/assigned leads, booked site visits, notifications, and analytics — deployable
by our Ops team for a real client. This validates the brain + grounding + CRM loop before the
higher-risk outbound/realtime investment.

---

## Phase 2 Enhancements (Weeks 13–24)

| Theme                        | Features                                                                                                                                      | Key dependencies                               | Folders                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------- |
| **Outbound Campaign Engine** | Campaigns, lead-list import (Meta/Google/CSV/API), dedup, enrich, segmentation, outreach orchestration, opt-out/DNC, per-tenant rate limiting | CRM, AI Employee, Channels, Conversation dedup | `contexts/campaign`, workers           |
| **Follow-Up Engine**         | Configurable rules (no-response/interested/scheduled/missed/viewed/cold), schedule + fire, stop on convert/opt-out                            | Campaign, Appointments, Notifications          | `contexts/campaign`                    |
| **Advanced Realtime Voice**  | Streaming STT partials → LLM → streaming TTS, barge-in/interruptions, human transfer, <1.2s p95                                               | voice-gateway, OpenAI Realtime                 | `apps/voice-gateway`, `contexts/voice` |
| **Transcript Intelligence**  | Speaker separation, keyword extraction, transcript search ("3 BHK Hyderabad", "budget > ₹1cr") via FTS, versioning, download                  | Calls                                          | `contexts/calls`, workers              |
| **Full Multilingual**        | 10 languages + code-switching detection/switching, per-language model routing, eval sets                                                      | AI Employee LanguageRouter                     | `contexts/ai-employee`                 |
| **Analytics v2**             | Campaign perf, lead sources, sentiment distribution, **CPL/ROAS**, site-visit conversion                                                      | usage/cost events from Phase 0                 | `contexts/analytics`                   |

**Outbound DoD gate:** consent/DNC/recording-compliance handling must ship _with_ outbound
calling, not after (see `PRD_REVIEW.md` and `SECURITY_GUIDELINES.md`).

---

## Future Enterprise Capabilities

- **Service extraction**: lift `voice-gateway` (already separate) then `campaign`/`analytics`
  to independent services (swap in-process bus for SNS/SQS or Kafka) when scale/team-ownership
  warrants — boundaries already make this mechanical (ADR-0002).
- **Public self-serve + Billing**: add registration + a Billing context consuming the usage
  events emitted since Phase 0; flip "no public signup".
- **New verticals** (healthcare, auto, education) via new template packs — config, not forks.
- **Enterprise security**: SSO/SCIM, full ABAC, data residency options, customer-managed KMS.
- **Data platform**: warehouse/lakehouse sink as a new event subscriber; BI/embedded analytics.

---

## Cross-cutting delivery rules

- Every feature follows [`FEATURE_BLUEPRINT.md`](FEATURE_BLUEPRINT.md) (14 sections) and ships
  with tests, docs, monitoring, and a rollback (feature flag) — no exceptions.
- Long-pole vendor onboarding (WhatsApp BSP approval, Twilio numbers, OpenAI/ElevenLabs quotas)
  starts **Week 1** in parallel — these are schedule risks, not engineering risks.
- Each phase ends with a demo against a real-ish client scenario, not a checklist.
