# Propulse AI — Product Overview

> **Purpose:** The single, plain-language "what & why" of Propulse AI — the orientation doc every engineer, PM, designer, and AI agent reads before anything else.
> **Owner:** Product + Principal Architect · **Update frequency:** every release that changes scope, personas, or the module map (paired with a [ROADMAP.md](ROADMAP.md) entry).
> **Audience:** all humans and AI agents working on the product. The _business source of truth_ is the [PRD](prd/CALLING_AI_V1.md); this doc summarizes and frames it — when they disagree on intent, the PRD wins.

---

## 1. What Propulse AI is

**Propulse AI is a multi-tenant, enterprise-grade AI Operating System for real estate.** It lets our team deploy human-like **AI employees** — voice and chat "pre-sales executives" — that capture, qualify, nurture, schedule, and convert property buyers automatically, across every channel a buyer might use.

It is **not** a chatbot builder and it is **not** public-facing software. In V1:

- The platform is **internally operated** — our Operations team creates and deploys organizations. There is **no public signup**.
- **Clients** (real estate businesses) receive **dashboards and operational control** over their own leads, conversations, calls, campaigns, and analytics.
- A single AI employee is expected to do the work of an entire inside-sales / pre-sales team: answer like a human, reason, remember context, handle objections, take real actions (book a site visit, send a brochure, assign an executive), and work proactively 24/7 in regional languages.

The bar for "good" is one sentence from the PRD: buyers should frequently ask **"Was that an actual person or AI?"**

## 2. Core mission

Propulse AI exists to eliminate the five ways real estate businesses lose money on leads:

| Mission promise                                      | What it means in practice                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Never miss a buyer**                               | Every inbound lead — website, WhatsApp, phone, Meta/Google form, CSV — is answered instantly, any hour, any language.                                   |
| **Never miss a follow-up**                           | The Follow-Up Engine fires the right nudge at the right time (no response → 1 day, interested → brochure, missed visit → reschedule, cold → re-engage). |
| **Never lose customer context**                      | One Contact = one unified timeline across channels. The AI remembers budget, location, configuration, objections, past calls.                           |
| **Never let leads go cold**                          | Outbound campaigns + autonomous nurturing keep prospects warm until they convert or opt out.                                                            |
| **Capture → qualify → nurture → schedule → convert** | The whole funnel is automated; humans step in only on escalation.                                                                                       |

## 3. Product philosophy: "AI employees, not chatbots"

We do not build scripted flows. We build **AI employees**. The distinction is load-bearing across the entire architecture:

- **Speaks naturally & sounds human** — pauses, fillers, interruptions, corrections; never sounds scripted.
- **Reasons like a human** — infers intent, understands incomplete sentences, asks follow-up questions, recommends next actions, makes decisions.
- **Remembers context** — persistent memory of the customer across conversations and channels.
- **Understands emotion & handles objections** — sentiment-aware, can de-escalate and persuade.
- **Takes real actions** — creates/updates leads, books site visits, sends WhatsApp/documents, assigns executives, schedules follow-ups, escalates.
- **Works proactively, cross-channel, multilingual** — English + 9 Indian languages and code-switched mixes (e.g. Telugu+English), auto-detecting and switching language.
- **Knows its limits** — escalates to a human when confidence is low, when the customer asks, or when business rules trigger; control can return to the AI afterward.

> Architecturally, this is why **AI Employee** and **Conversation Engine** are _core_ bounded contexts (the differentiation and the moat), and why the AI's "actions" are modeled as **commands/intents to other contexts**, never direct table writes. See [ARCHITECTURE.md §3](ARCHITECTURE.md) and [DOMAIN_RULES.md](DOMAIN_RULES.md).

## 4. Target users & personas

Propulse AI serves two distinct populations: the **internal Ops team** who run the platform, and the **client users** who operate their business inside it.

### 4.1 Client organizations (who we deploy for)

| Persona                                          | Profile                                                         | What they want                                                                           |
| ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Developer / Builder**                          | Large project inventory, high inbound volume, multiple projects | Capture every inbound lead, qualify at scale, book site visits, full pipeline visibility |
| **Brokerage / Agency**                           | Multiple agents, mixed-source leads (portals, ads, referrals)   | Dedupe + route leads fairly, run outbound campaigns, agent performance analytics         |
| **Individual Realtor / Agent**                   | Solo or small team, can't answer every call                     | A tireless AI that never misses a buyer or follow-up                                     |
| **Sales / Pre-Sales / Inside Sales / CRM teams** | The humans inside a client org                                  | Clean assignments, warm hand-offs, less manual qualification, accurate CRM               |

### 4.2 Roles (PRD-defined)

| Scope        | Role                                      | Responsibility                                                                                                           |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Platform** | **Super Admin**                           | Full platform control: organizations, users, audit logs, system health, settings. May cross tenant boundaries (audited). |
| **Platform** | **Operations Admin**                      | Deploys & manages client organizations (the "30-minute deploy" operators).                                               |
| **Tenant**   | **Client Owner**                          | Owns one organization; full control of their org's data & config.                                                        |
| **Tenant**   | **Sales Manager**                         | Oversees pipeline, assignments, campaigns, team performance for their org.                                               |
| **Tenant**   | **Sales Executive / Pre-Sales Executive** | Handles assigned leads/conversations; receives AI escalations.                                                           |
| **Tenant**   | **Support**                               | Read-mostly support of their org's operations.                                                                           |

> Platform roles span organizations; tenant roles are scoped to exactly one organization. Authorization = **tenant scope × RBAC** (CASL-style abilities). See [ARCHITECTURE.md §11](ARCHITECTURE.md).

## 5. The "30-minute deploy" promise

The headline promise: **an Operations Admin can stand up a fully working AI employee for a new real estate client in under 30 minutes.** What makes that possible is the **real-estate templates engine** — picking a template (Developer / Builder / Broker / Agency / Individual Agent) auto-provisions a CRM pipeline, an AI employee, qualification questions, follow-up rules, notifications, dashboards, campaign templates, and appointment rules.

**Onboarding wizard (target < 30 min):**

```
Create Organization
  → Choose Real Estate Template      (auto-creates pipeline, AI employee, rules, dashboards)
  → Upload Brochures
  → Upload Pricing
  → Connect WhatsApp
  → Connect Phone
  → Configure Qualification Questions
  → Review AI Employee
  → Test
  → Go Live
```

"30 minutes" is a _product SLO_, not marketing: it constrains design. Anything that would make onboarding slower than this (manual prompt-engineering, hand-built pipelines, bespoke integrations per client) is a design smell — push it into the template/config layer.

## 6. Primary value loops

The product runs two complementary loops. Both end in **CRM updated + Analytics updated**, because the system's job is to keep the pipeline truthful and never let a lead fall through.

### 6.1 Inbound journey — "never miss a buyer"

```
Lead Arrives  →  AI Responds  →  AI Qualifies  →  Lead Created  →  Lead Scored
   →  Executive Assigned  →  Site Visit Scheduled  →  Confirmation Sent
   →  CRM Updated  →  Analytics Updated
```

A buyer reaches out on any channel; the AI employee answers instantly, qualifies (budget, location, configuration, timeline, intent), creates and scores the lead, assigns an executive (round-robin / location / project based — _no lead stays unassigned_), books a site visit, confirms it, and writes everything back to CRM and analytics.

### 6.2 Outbound journey — "never let leads go cold"

```
Import Lead List  →  AI Calls Prospect  →  AI Qualifies Buyer  →  AI Handles Questions
   →  AI Shares Information  →  AI Books Site Visit  →  CRM Updated
   →  Executive Assigned  →  Follow-Ups Scheduled  →  Analytics Updated
```

A lead list (Meta/Google/CSV/CRM/API) is imported, deduplicated, enriched, and segmented; the AI employee proactively calls/messages prospects, qualifies them, answers questions from the Knowledge Base, books visits, and schedules follow-ups — stopping when a lead converts or opts out.

> Both loops are realized as **event choreographies**, not inline call chains — see the inbound event flow in [ARCHITECTURE.md §8](ARCHITECTURE.md).

## 7. Module map

The platform is composed of bounded contexts that map 1:1 to NestJS modules (see [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md)). Class = DDD core/supporting/generic (see [ARCHITECTURE.md §3](ARCHITECTURE.md)).

| Module / Bounded context         | Class       | One-liner                                                                                                                          |
| -------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **IAM**                          | Generic     | Orgs-as-tenants, users, roles, invitations, sessions. No public signup.                                                            |
| **Organization & Onboarding**    | Supporting  | Org profile/config, real-estate templates, the < 30-min deploy wizard.                                                             |
| **Knowledge Base**               | Supporting  | Ingests brochures/pricing/FAQs/URLs → extract → chunk → embed → RAG retrieval.                                                     |
| **AI Employee**                  | **Core**    | The "brain": identity, personality, memory, knowledge bindings, permitted actions, goals, escalation, prompt assembly + reasoning. |
| **Conversation Engine**          | **Core**    | Unified cross-channel timeline, sessions, messages, identity resolution. The hub.                                                  |
| **Channels**                     | Generic-ish | Adapters: Website Chat, WhatsApp, Voice/PSTN, Meta/Google lead forms, CSV/API import.                                              |
| **Voice / Telephony**            | **Core**    | Call lifecycle + realtime media (STT↔LLM↔TTS) in `voice-gateway`. The "is it human?" loop.                                         |
| **Calls & Transcription**        | Supporting  | Recordings, transcripts, AI summaries, sentiment, searchable intelligence.                                                         |
| **CRM**                          | Supporting  | Contacts, leads, configurable pipeline, activities, assignment.                                                                    |
| **Lead Qualification & Scoring** | Supporting  | Configurable qualification questions; hot/warm/cold scoring engine.                                                                |
| **Campaign Engine**              | **Core**    | Inbound + outbound campaigns, lead lists, segmentation, autonomous outreach, follow-up engine.                                     |
| **Appointments**                 | Supporting  | Site visits / virtual / phone consults; book, reschedule, remind, calendar, maps.                                                  |
| **Notifications**                | Generic     | Event-driven multi-channel delivery (in-app / email / WhatsApp).                                                                   |
| **Analytics & Reporting**        | Generic     | Read-model metrics & dashboards (conversion, CPL, ROAS, agent performance).                                                        |
| **Platform Ops / Admin**         | Generic     | Super-admin console, audit log, system health, feature flags.                                                                      |

## 8. Glossary of key business terms

These are the canonical business terms. Full domain invariants live in [DOMAIN_RULES.md](DOMAIN_RULES.md); architectural definitions in [ARCHITECTURE.md §4](ARCHITECTURE.md).

| Term                     | Definition                                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Organization**         | **The tenant.** Synonymous with "client/business". The root of all data ownership — every row, cache key, queue job, S3 object, and vector is scoped to an `organizationId`. |
| **Contact**              | A real-world person (buyer/prospect), **deduplicated across channels** by identity resolution (phone/email/WhatsApp/contact id). One person = one Contact.                   |
| **Lead**                 | A **sales opportunity** attached to a Contact within a pipeline. A Contact may have **multiple Leads** over time. **Contact ≠ Lead.**                                        |
| **AI Employee**          | A configured autonomous agent instance owned by an Organization — identity, personality, memory, knowledge bindings, permitted actions, goals, escalation rules.             |
| **Conversation**         | A channel-spanning thread of interaction with one Contact, presented as a single unified **Timeline**. A **Message** is one turn within it.                                  |
| **Campaign**             | An inbound or outbound program operating over a **Segment** of Leads/Contacts (with autonomous outreach + follow-up).                                                        |
| **Appointment**          | A scheduled **Site Visit / Virtual Meeting / Phone Consultation**, with reminders, executive assignment, calendar + Google Maps.                                             |
| **Escalation / Handoff** | Transfer of control from the AI employee to a human executive (and back) — triggered by low confidence, customer request, or business rules.                                 |
| **Assignment**           | The binding of a Lead/Conversation to a human Executive (round-robin / manual / location / project / fallback — _no lead stays unassigned_).                                 |
| **Lead Score**           | Hot / Warm / Cold rating computed from budget, timeline, engagement, intent, call duration, site-visit interest, sentiment. Auto-updated.                                    |

## 9. Success metrics — what "good" looks like

Two layers: the **product north star** and the **operational metrics** the platform surfaces in Analytics.

**North star:** buyers can't tell the AI employee from a top human pre-sales executive — and the client's pipeline is never missing a lead or a follow-up.

| Dimension                  | "Good" looks like                                                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Coverage**               | Leads captured ≈ leads arrived; **0 unassigned leads**; first response is instant on every channel.                  |
| **Conversational realism** | Voice end-to-end turn **< 1.2s p95**; text webhook→reply **< 2s p95**. (See [ARCHITECTURE.md §13](ARCHITECTURE.md).) |
| **Funnel conversion**      | High lead→qualified→site-visit→booked conversion; rising site-visit conversion rate.                                 |
| **Follow-up discipline**   | Every due follow-up fires on time; cold-lead re-engagement runs automatically.                                       |
| **Quality / trust**        | Grounded answers (RAG + citations), low hallucination, sentiment trending positive, escalations handled fast.        |
| **Unit economics**         | Falling **Cost Per Lead**, rising **ROAS**; transparent per-tenant cost telemetry.                                   |
| **Deploy speed**           | New client live in **< 30 minutes**.                                                                                 |

The PRD's Analytics surface (the metrics clients actually see): Leads Captured, Calls Handled, Conversations, Appointments Booked, Campaign Performance, Lead Sources, Response Time, Conversion Rate, Hot Leads, Sales/Agent Performance, Sentiment Distribution, Site Visit Conversion, Cost Per Lead, ROAS.

## 10. Where to go next

| Doc                                                | Read it for                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| [prd/CALLING_AI_V1.md](prd/CALLING_AI_V1.md)       | The verbatim business source of truth.                                          |
| [ARCHITECTURE.md](ARCHITECTURE.md)                 | How the system is built (modular monolith, events, multi-tenancy).              |
| [DOMAIN_RULES.md](DOMAIN_RULES.md)                 | Ubiquitous language + domain invariants (Contact vs Lead, scoring, assignment). |
| [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) | Where code lives and the rules that protect the boundaries.                     |
| [ROADMAP.md](ROADMAP.md)                           | What's shipping when, and what's deferred.                                      |
| [ONBOARDING_GUIDE.md](ONBOARDING_GUIDE.md)         | Get productive in 30 minutes.                                                   |
