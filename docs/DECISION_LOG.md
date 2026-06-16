# Propulse AI — Decision Log

> **Owner:** Architects (Principal Architect accountable) · **Update frequency:** every
> significant decision (add a row here in the same PR as the change/ADR) · **Audience:** all
> engineers + AI agents.

This is a **lightweight, chronological index of decisions** — a fast scan of "what did we
decide, when, and why, and where do I read the full reasoning?". It **complements** the
[Architecture Decision Records](adr/), it does not replace them.

## How this relates to ADRs

- An **ADR** (in [`adr/`](adr/)) is the full record of one architecturally significant
  decision — Context, Decision, Consequences, Alternatives. ADRs are **immutable and
  append-only**: a decision is changed by *superseding* it with a new ADR, never by editing the
  old one.
- This **Decision Log** is the *index*: one row per decision, pointing at the ADR. Use it to
  find decisions; use the ADR to understand them.
- It also hosts the **living risk register** (below), which the architecture intentionally
  keeps here ([`ARCHITECTURE.md`](ARCHITECTURE.md) §15 ends with "Full living risk register:
  extend `DECISION_LOG.md` as decisions are made").

Not every commit needs an entry. A decision belongs here (and usually in an ADR) when it is
**architecturally significant**: it changes a boundary, a cross-cutting invariant, the tech
stack, the data model's shape, the security/tenancy posture, or anything other teams must build
around. Cosmetic or local choices do not.

---

## ADR index

| ID | Title | Status | Date | Summary | Link |
|---|---|---|---|---|---|
| ADR-0001 | Multi-tenancy: shared schema + `organizationId` + Postgres RLS | Accepted | 2026-06-16 | Single DB, shared schema, `organizationId` discriminator, defended in depth by app guard → Prisma middleware → Postgres RLS. Rejected DB-per-tenant and schema-per-tenant as premature for an internally-managed V1. | [adr/0001](adr/0001-multi-tenancy-shared-schema-rls.md) |
| ADR-0002 | Modular monolith over microservices | Accepted | 2026-06-16 | One NestJS app, one module per bounded context with hard lint-enforced boundaries; extract a context to its own service only on a defined trigger (divergent runtime profile, independent scaling, fault isolation, team scaling). | [adr/0002](adr/0002-modular-monolith-over-microservices.md) |
| ADR-0003 | RBAC via a CASL-style policy layer | Accepted | 2026-06-16 | Authorization as `(action, subject)` abilities built from role + tenant scope; platform vs tenant roles; "assigned-to-me" as policy conditions. Full ABAC deferred. | [adr/0003](adr/0003-rbac-casl-policy-layer.md) |
| ADR-0004 | Monorepo with Turborepo + pnpm | Accepted | 2026-06-16 | Single repo, `apps/` (deployables) vs `packages/` (libraries), one-way dependency, cached parallel builds, atomic cross-cutting changes. Rejected polyrepo and npm/yarn/Nx. | [adr/0004](adr/0004-monorepo-turborepo-pnpm.md) |
| ADR-0005 | Voice-gateway separation | Accepted | 2026-06-16 | Run the realtime voice loop as a separate `apps/voice-gateway` deployable (long-lived, latency-critical, < 1.2s p95) while reusing context app code — a deployment split, not a logic fork. Applies the ADR-0002 extraction trigger. | [adr/0005](adr/0005-voice-gateway-separation.md) |
| ADR-0006 | Domain event bus + transactional outbox → BullMQ | Accepted | 2026-06-16 | Cross-context side effects are events written to an outbox in the same transaction as the state change, relayed to BullMQ; at-least-once delivery, idempotent handlers; events named `<context>.<aggregate>.<pastTenseFact>.v<major>`. | [adr/0006](adr/0006-event-bus-and-outbox.md) |

---

## Living risk register

Seeded from [`ARCHITECTURE.md`](ARCHITECTURE.md) §15. This is the *maintained* version — update
status, add risks, and reassign owners here as the system evolves. (Owners are roles, not
individuals; map to people via CODEOWNERS.)

| # | Risk | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|
| R-1 | **Voice latency/quality** misses the "is it human?" bar | Core value prop fails | Medium | Dedicated `voice-gateway` (ADR-0005), streaming STT→LLM→TTS pipeline, strict < 1.2s p95 SLOs + alarms, fallback to human handoff | Voice context owner | Open — mitigations in design |
| R-2 | **Modular-monolith boundaries erode** into a big ball of mud | Future service extraction impossible | Medium | Lint-enforced import boundaries, dependency-cruiser, no cross-context table access, architecture-fitness test in CI, ADR discipline (ADR-0002) | Principal Architect | Open — guardrails in CI |
| R-3 | **Multi-tenant data leak** | Catastrophic / legal | Low (if enforced) | Defense in depth: app guard + Prisma middleware + Postgres RLS (ADR-0001) + automated cross-tenant CI tests | Security + Platform | Open — defense-in-depth + CI tests |
| R-4 | **Third-party cost & rate limits** (OpenAI/Twilio/ElevenLabs/WhatsApp) | Cost blowup, throttling | High | Per-tenant + per-provider rate limiting, caching, cost telemetry (CPL/ROAS), provider abstraction behind ports to swap vendors | Platform + AI Employee owner | Open — ongoing |
| R-5 | **LLM nondeterminism / hallucination** giving wrong property/price info | Trust + legal | Medium | RAG grounding + citations, guardrails, confidence-based escalation, eval harness on KB answers; never present ungrounded facts as authoritative (DOMAIN_RULES BC-1.AI) | AI Employee context owner | Open — eval harness pending |
| R-6 | **Regional language + code-switching** quality | Core differentiator weak | Medium | Per-language provider/model selection (`LanguageRouter`), per-language eval datasets, human-review loop | AI Employee context owner | Open |
| R-7 | **Compliance (consent/recording/DPDP)** under-specified in PRD | Legal exposure | High | Capture consent, support DNC/opt-out, honor data-subject deletion; treated as an **MVP blocker for outbound** (see `PRD_REVIEW.md`) | Security + Product | Open — flagged blocker |
| R-8 | **Single Postgres as everything** (OLTP + pgvector + FTS) contention at scale | Degraded performance | Medium | Read replica for Analytics/heavy reads, PgBouncer pooling, monitoring, documented extraction ramps for vector store; partition-ready high-volume tables | Platform / DBA | Open — monitor + ramps documented |

---

## Adding a decision

1. **Decide whether it's significant** (see "How this relates to ADRs"). If yes:
2. **Write an ADR.** Copy [`adr/_TEMPLATE.md`](adr/_TEMPLATE.md) to
   `adr/NNNN-kebab-title.md` (next number), fill every section, set Status (usually `Proposed`
   → `Accepted` once decided), Date, Deciders.
3. **Add one row to the ADR index** above (id, title, status, date, one-line summary, link).
4. **Touch the risk register** if the decision changes a risk's mitigation, owner, or status —
   or adds a new risk. Keep statuses honest (Open / Mitigated / Accepted / Closed).
5. **Do it in the same PR** as the change it documents. A decision without its log/ADR entry is
   an undocumented decision.
6. **Superseding:** to reverse or replace a decision, write a *new* ADR, set the old ADR's
   status to `Superseded by ADR-XXXX`, and update its row here. Never edit an accepted ADR's
   substance.
