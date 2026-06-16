# Propulse AI — API Contracts (Phase 3)

> **Purpose:** The canonical, contract-level index of every externally callable surface of
> Propulse AI — REST endpoints, inbound webhooks, and the WebSocket protocol. It defines the
> conventions (auth, tenancy, pagination, errors, idempotency, rate limits) that every endpoint
> obeys and a per-context endpoint catalog. This is an **index of contracts, not exhaustive
> schemas** — the authoritative request/response/event schemas are the **zod** definitions in
> [`packages/contracts`](../packages/contracts). When this doc and the zod schemas disagree, the
> zod schemas win and this doc is the bug.
>
> **Owners (per context — see CODEOWNERS):**
>
> | Context | Owner |
> |---|---|
> | IAM / Auth | Platform/Identity team |
> | Organization & Onboarding | Onboarding team |
> | Knowledge Base | KB/RAG team |
> | AI Employee | AI Core team |
> | Conversation Engine | Conversation team |
> | Channels / Webhooks | Channels team |
> | Voice / Calls | Voice team |
> | CRM | CRM team |
> | Lead Qualification | CRM team |
> | Campaign Engine | Growth/Campaign team |
> | Appointments | Appointments team |
> | Notifications | Platform team |
> | Analytics | Data/Analytics team |
> | Platform Ops / Admin | Platform Ops team |
> | API conventions (this preamble) | Principal Architect |
>
> **Update frequency:** **with every endpoint change** — adding, removing, or changing the
> shape/auth/role of any endpoint, webhook, or WS event requires updating this file in the same
> PR as the code + the zod contract. Reviewed by the owning context's CODEOWNER.

Builds on [`ARCHITECTURE.md`](ARCHITECTURE.md) (§7 Communication, §10 Multi-tenancy, §11
Authorization) and [`DOMAIN_RULES.md`](DOMAIN_RULES.md). The async/event side is documented in
[`EVENT_CATALOG.md`](EVENT_CATALOG.md).

---

## 1. API Conventions

These conventions are **non-negotiable and apply to every REST endpoint** unless explicitly
noted. They are enforced by shared NestJS guards, interceptors, and pipes, not re-implemented
per controller.

### 1.1 Base URL & versioning

- All REST is served under `/api/v1`. The **major** API version is in the URL path.
- Versioning is **additive within a major**: new optional fields, new endpoints, new enum
  values (clients must tolerate unknown enum values). Breaking changes (removing/renaming a
  field, tightening validation, changing a status code's meaning) require `/api/v2`.
- WebSocket is served at `wss://<host>/ws` (single namespace, versioned via the connection
  `protocolVersion`; see §4).
- Webhooks are served under `/api/v1/webhooks/<provider>` (see §3).

### 1.2 Resource naming (REST)

- **Plural, kebab-or-lower nouns**, hierarchical where ownership is real:
  `/leads`, `/leads/{leadId}/activities`, `/ai-employees/{id}/action-grants`.
- Use sub-resources only for true containment; otherwise filter (`/activities?leadId=...`).
- Verbs are **not** in paths except for non-CRUD domain transitions modeled as actions:
  `POST /leads/{id}:assign`, `POST /conversations/{id}:handoff`,
  `POST /appointments/{id}:reschedule`, `POST /campaigns/{id}:launch`. The `:action` suffix
  marks an intent-style command (these typically emit domain events — see EVENT_CATALOG).
- IDs are opaque, prefixed ULIDs/UUIDs (e.g. `lead_01J...`). Never expose DB sequence ints.

### 1.3 Authentication & tenant scoping

- **Auth:** session cookie (dashboard, httpOnly + SameSite, backed by Redis `SessionStore`) or
  a **Bearer JWT** (programmatic/API clients). Both resolve to a request-scoped principal:
  `{ userId, organizationId, roles[], scope: platform|tenant, abilities }`.
- **`organizationId` is ALWAYS derived from the authenticated principal — NEVER from the request
  body, query, or a header.** A tenant guard binds it to the request context and to the
  Postgres `app.current_org` GUC (ARCHITECTURE §10). Any body field attempting to set
  `organizationId` is rejected with `422`.
- **Platform roles** (`SuperAdmin`, `OperationsAdmin`) may operate across orgs **only** through
  the audited `/api/v1/admin/**` endpoints, which require an explicit `X-Acting-Org` header that
  is itself authorized and **audit-logged** (Platform Ops). All other endpoints are single-org.
- RBAC is evaluated by the CASL ability layer as `(action, subject)` pairs (ARCHITECTURE §11).
  The "who can call" column below names the **minimum** role; higher roles inherit. Resource
  refinements (e.g. a `SalesExecutive` may only mutate leads assigned to them) are enforced in
  the policy layer, not the route table.

### 1.4 Pagination (cursor-based)

- All list endpoints are **cursor-paginated**, never offset (ARCHITECTURE §13: pagination
  mandatory). Request: `?limit=<1..100, default 25>&cursor=<opaque>`.
- Response envelope:

  ```json
  {
    "data": [ /* items */ ],
    "page": { "nextCursor": "eyJ...", "hasMore": true, "limit": 25 }
  }
  ```

- Cursors are opaque, signed, and encode the sort key + tiebreaker (id). They are stable across
  inserts. A `null` `nextCursor` means end of results.

### 1.5 Filtering & sorting

- Filtering via explicit query params per resource (whitelisted, zod-validated):
  `GET /leads?stage=Qualified&score=Hot&assignedTo=me&source=WhatsApp`.
- Free-text search via `?q=` where supported (FTS-backed). Date ranges via
  `?from=<ISO>&to=<ISO>`.
- Sorting via `?sort=<field>` / `?sort=-<field>` (leading `-` = descending). Allowed sort
  fields are whitelisted per resource; default sort is documented per endpoint (usually
  `-createdAt`). Unknown filter/sort fields → `422`.

### 1.6 Error format — RFC 9457 Problem Details

All errors use `application/problem+json` with RFC 9457 shape, extended with `traceId` and,
for validation, a structured `errors` array (from the zod parse failure):

```json
{
  "type": "https://errors.propulse.ai/validation-failed",
  "title": "Request validation failed",
  "status": 422,
  "detail": "2 fields are invalid.",
  "instance": "/api/v1/leads",
  "traceId": "01J8X...",
  "errors": [
    { "path": "budget.min", "code": "invalid_type", "message": "Expected integer minor units" },
    { "path": "phone", "code": "invalid_string", "message": "Must be E.164" }
  ]
}
```

Conventional `type` slugs & statuses: `unauthenticated` (401), `forbidden` (403),
`not-found` (404), `conflict` (409), `validation-failed` (422), `rate-limited` (429),
`idempotency-key-reused` (409), `tenant-scope-violation` (403), `webhook-signature-invalid`
(401), `internal` (500). `traceId` correlates to logs/Sentry and to the event
`correlationId` (EVENT_CATALOG).

### 1.7 Idempotency keys

- **Every mutating endpoint** (`POST`/`PATCH`/`PUT`/`DELETE` and `:action` commands) **and every
  webhook** accepts/honors idempotency.
  - REST clients send `Idempotency-Key: <client-uuid>`. The server stores
    `(organizationId, route, key) → first response` for 24h and **replays the stored response**
    on retry; a key reused with a *different* body returns `409 idempotency-key-reused`.
  - Webhooks are deduplicated by the provider's native id (e.g. Twilio `CallSid`/message SID,
    Meta `leadgen_id`, WhatsApp message `id`) — see §3.
- This is the API-edge complement to the at-least-once, **idempotent event handlers** described
  in ARCHITECTURE §8 / EVENT_CATALOG §1.

### 1.8 Rate limiting headers

- Per-principal and per-org token-bucket limits at the edge (ALB/WAF) and in-app. Responses
  include:
  - `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (seconds) on every response.
  - `429` responses include `Retry-After`.
- Outbound third-party limits (WhatsApp/Twilio/OpenAI) are governed by **per-tenant** worker
  rate limits (ARCHITECTURE §12), not these inbound headers.

### 1.9 Request validation (zod from `packages/contracts`)

- Every controller validates input with a **zod schema imported from `packages/contracts`** via
  a global `ZodValidationPipe`. The same schemas are reused on the client (typed SDK) and in
  contract tests, so the wire contract has exactly one source of truth.
- Responses are also serialized through the contract schemas (strip unknown, enforce shape).
- Standard headers honored on all requests: `Authorization`/cookie, `Idempotency-Key`,
  `X-Request-Id` (echoed; generated if absent), `Accept-Language` (drives `LanguageTag`
  defaults), `If-Match`/`ETag` for optimistic concurrency on config aggregates.

---

## 2. (reserved) — see §5 for the per-context endpoint catalog

---

## 3. Webhook Ingress Contracts

Webhook controllers are **thin adapters** (DOMAIN_RULES "Channels are thin adapters",
ARCHITECTURE §7): they (1) **verify the signature**, (2) dedupe by provider id, (3) **normalize
to an internal `InboundMessage`** (or call/lead artifact), (4) enqueue / emit the inbound event,
and (5) return fast. **No business logic, no AI calls, no DB writes beyond the inbox/outbox row**
inside the controller. They almost always terminate by emitting `channels.message.received.v1`
(chat/WA) or `calls.incoming.received.v1` (voice) or a CRM lead-capture path (lead forms).

| Provider | Path | Signature verification | Normalizes to | Emits |
|---|---|---|---|---|
| **WhatsApp (BSP/Meta Cloud)** | `POST /api/v1/webhooks/whatsapp` (+ `GET` for verify challenge) | `X-Hub-Signature-256` HMAC-SHA256 over raw body with app secret; constant-time compare; reject mismatch `401` | `InboundMessage{ channel: WhatsApp, from: E164, waMessageId, content, mediaRefs }` | `channels.message.received.v1` |
| **Twilio Voice (PSTN)** | `POST /api/v1/webhooks/twilio/voice` (call lifecycle + status callbacks) | `X-Twilio-Signature` HMAC-SHA1 over full URL + sorted params with auth token; reject mismatch `401` | `Call` lifecycle event keyed by `CallSid` (incoming → start media stream to voice-gateway) | `calls.incoming.received.v1`, then `calls.started.v1` / `calls.ended.v1` / `calls.recording.available.v1` |
| **Meta Lead Ads forms** | `POST /api/v1/webhooks/meta/lead-forms` (+ `GET` verify) | `X-Hub-Signature-256` HMAC-SHA256 (same as WhatsApp); reject `401` | Lead capture `{ source: Meta, leadgenId, fieldData, formId, campaignRef }` | CRM lead-capture path → `crm.lead.created.v1` (+ campaign list attach) |
| **Google Lead Form Extensions** | `POST /api/v1/webhooks/google/lead-forms` | Shared `google_key` + payload signature per Google spec; verify configured key; reject `401` | Lead capture `{ source: Google, leadId, userColumnData }` | CRM lead-capture path → `crm.lead.created.v1` |

**Common webhook rules (all providers):**

- **Replay/timestamp protection:** reject requests outside a small clock skew window and dedupe
  by provider message/event id (the idempotency story of §1.7). Duplicate delivery → `200` with
  no re-processing.
- **Multi-tenant routing:** the provider resource (WhatsApp phone-number id, Twilio number, Meta
  page/form id) is mapped to an `organizationId` via a tenant routing table; an unmapped
  resource → `404`/drop + alert (never guess the tenant).
- **Fast ack:** verify + persist to inbox/outbox, return `2xx` immediately; all real work is a
  queued job (ARCHITECTURE §9). Never block the provider on AI/LLM latency.
- The normalized `InboundMessage` / lead-capture shapes are zod schemas in
  `packages/contracts/channels`.

---

## 4. WebSocket Contract

Realtime push for the dashboards (ARCHITECTURE §7: live conversation/agent status, presence,
notifications). Backed by Redis pub/sub fan-out from `apps/api`/`apps/workers` to the gateway.

### 4.1 Connection & auth

- Endpoint: `wss://<host>/ws`. Auth on the **handshake** only — the same session cookie or
  `Authorization: Bearer <jwt>` as REST. Unauthenticated handshakes are rejected before upgrade.
- On connect the server derives `{ userId, organizationId, roles }` and **auto-joins the socket
  to tenant rooms** (the client may NOT request arbitrary rooms):
  - `org:{organizationId}` — org-wide broadcasts (presence, campaign/system notices).
  - `org:{organizationId}:user:{userId}` — user-targeted notifications/assignments.
  - `org:{organizationId}:conv:{conversationId}` — joined on demand via a `subscribe` message,
    authorized against the user's ability to read that conversation. A user can never join
    another org's room (tenant isolation, ARCHITECTURE §10).
- Heartbeat: server `ping` every 25s; client must `pong`. Missed → disconnect. Reconnect uses
  `Last-Event-ID` to request a short replay buffer (best-effort; authoritative state is REST).

### 4.2 Message envelope

Every WS frame (both directions) uses one envelope:

```json
{
  "type": "event",
  "channel": "conversation",
  "event": "conversation.message.appended",
  "id": "01J8...",
  "occurredAt": "2026-06-16T10:00:00.000Z",
  "organizationId": "org_...",
  "correlationId": "01J8...",
  "data": { /* event-specific, validated by packages/contracts */ }
}
```

- `type` ∈ `event` (server→client push), `command` (client→server: `subscribe`,
  `unsubscribe`, `presence.set`, `typing`), `ack`, `error` (Problem-Details-shaped `data`).
- `channel` ∈ `conversation`, `agent`, `notifications`, `presence`. `event` names mirror the
  domain event names where a WS push corresponds to a domain fact.

### 4.3 Channels & events

| Channel | Direction | Events | Notes |
|---|---|---|---|
| `conversation` | server→client | `conversation.message.appended`, `conversation.control.transferred`, `conversation.handoff.requested`, typing/agent-thinking indicators | Scoped to a subscribed `conv:{id}` room. Mirrors EVENT_CATALOG facts. |
| `agent` | server→client | `agent.status.changed` (AI reasoning/active/escalated), `agent.action.dispatched` | Live AI Employee status for the open conversation. |
| `notifications` | server→client | `notification.delivered` (InApp channel of `notifications.delivered.v1`) | User/role-targeted; the in-app arm of the Notifications context. |
| `presence` | bi-directional | `presence.set` (client→server), `presence.updated` (server→broadcast) | Who's online/handling what, for the team view. |

---

## 5. REST Endpoint Catalog (per context)

Compact contract index. **Authoritative schemas live in `packages/contracts`** (named per the
"Schema" column convention `<context>.<Op>Request/Response`). "Role" = minimum role; platform
admin endpoints live under `/admin` and are audited. All list endpoints follow §1.4–1.5.

### 5.1 Auth / IAM

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| POST | `/auth/login` | Session/JWT login | public (no signup) | `{email,password}` → `{session\|token, user}` |
| POST | `/auth/logout` | Revoke current session | any authed | `{}` → `204` (emits `iam.session.revoked.v1`) |
| POST | `/auth/refresh` | Rotate JWT | any authed | refresh token → new token |
| GET | `/auth/me` | Current principal + abilities | any authed | → `{user, organizationId, roles, abilities}` |
| POST | `/invitations` | Issue invitation | OperationsAdmin / ClientOwner | `{email, role}` → `{invitation}` (emits `iam.user.invited.v1`) |
| POST | `/invitations/{token}:accept` | Accept invite, set credentials | public (valid token) | `{password,...}` → `{user}` (emits `iam.user.activated.v1`) |
| GET | `/users` | List org users | SalesManager | filters: `role`, `q` → users |
| POST | `/users/{id}/roles` | Assign/replace role | ClientOwner (tenant) / OperationsAdmin | `{role}` → `{user}` (emits `iam.role.assigned.v1`) |
| GET | `/admin/organizations` | List all orgs (cross-tenant) | SuperAdmin / OperationsAdmin | audited; `X-Acting-Org` not used here |
| POST | `/admin/organizations` | Create org (no public signup) | SuperAdmin | `{name,...}` → `{org}` (emits `iam.organization.created.v1`) |

> **Never-violate:** no public registration endpoint exists; org/user creation is admin- or
> invitation-only (DOMAIN_RULES IAM). Tokens are never logged.

### 5.2 Organization & Onboarding

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/organization/profile` | Read org profile/config | ClientOwner | → `{profile}` |
| PATCH | `/organization/profile` | Update profile (hours, tz, languages, brand) | ClientOwner | partial → `{profile}` (emits `org.profile.updated.v1`); `If-Match` |
| GET | `/onboarding` | Onboarding flow + step state | ClientOwner | → `{steps, completion}` |
| POST | `/onboarding/steps/{stepId}:complete` | Mark a wizard step done | ClientOwner | `{payload}` → `{flow}` (emits `org.onboarding.step.completed.v1`; final step → `org.onboarding.completed.v1`) |
| GET | `/templates` | List real-estate templates | ClientOwner | → templates |
| POST | `/organization:apply-template` | Apply a template (provisioning saga) | ClientOwner | `{templateId}` → `202 {sagaId}` (emits `org.template.applied.v1` + `org.provision.*.requested.v1`) |

> Template application is the idempotent, re-drivable saga of DOMAIN_RULES BC-9 — `202` +
> progress polled via `GET /onboarding`.

### 5.3 Knowledge Base

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| POST | `/kb/sources` | Register/upload a source (file via signed URL or URL/text) | SalesManager | `{type, ...}` → `{source, uploadUrl?}` (emits `kb.source.uploaded.v1`) |
| GET | `/kb/sources` | List sources + ingestion status | SalesExecutive | filters: `type`, `status` |
| GET | `/kb/sources/{id}` | Source + documents + ingestion lifecycle | SalesExecutive | → `{source, ingestion}` |
| POST | `/kb/sources/{id}:reindex` | Re-ingest / re-embed | SalesManager | `{}` → `202` (emits `kb.source.reindexed.v1`) |
| DELETE | `/kb/sources/{id}` | Remove a source | SalesManager | → `204` |
| POST | `/kb/retrieval:query` | Debug/preview RAG retrieval (cited) | SalesManager | `{query}` → `{results[] (chunk+score+citation)}` (tenant-filtered) |

> Ingestion is async (ARCHITECTURE §9). Retrieval is always tenant-filtered (never returns
> another tenant's chunks — DOMAIN_RULES BC-5 never-violate).

### 5.4 AI Employee

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/ai-employees` | List configured AI employees | SalesManager | → employees |
| POST | `/ai-employees` | Create AI employee config | ClientOwner | `{identity, personality, languages,...}` → `{employee}` (emits `ai.employee.created.v1`) |
| GET | `/ai-employees/{id}` | Full config | SalesManager | → `{employee}` |
| PATCH | `/ai-employees/{id}` | Update config | ClientOwner | partial → `{employee}` (emits `ai.employee.updated.v1`); `If-Match` |
| PUT | `/ai-employees/{id}/action-grants` | Set permitted actions (`ActionGrant`) | ClientOwner | `{grants[]}` → `{employee}` |
| PUT | `/ai-employees/{id}/knowledge-bindings` | Bind KB sources | ClientOwner | `{sourceIds[]}` → `{employee}` |
| PUT | `/ai-employees/{id}/escalation-rules` | Set escalation rules | ClientOwner | `{rules[]}` → `{employee}` |
| POST | `/ai-employees/{id}:test` | Sandbox a turn (no side effects) | SalesManager | `{message}` → `{reply, confidence, citations}` |

> AI Employee never owns CRM/KB/appointment state; it acts via granted actions only
> (DOMAIN_RULES BC-1.AI never-violate). `:test` runs reasoning with action dispatch disabled.

### 5.5 Conversations

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/conversations` | List conversations (timeline heads) | SalesExecutive | filters: `status`, `channel`, `controlState`, `assignedTo`, `q` |
| GET | `/conversations/{id}` | Unified cross-channel timeline | SalesExecutive | → `{conversation, timeline}` (read all in org; modify per assignment) |
| POST | `/conversations/{id}/messages` | Human/agent posts a message | SalesExecutive | `{content}` → `{message}` (emits `conversation.message.appended.v1`) |
| POST | `/conversations/{id}:handoff` | Request AI→human handoff | SalesExecutive | `{reason}` → `{conversation}` (emits `conversation.handoff.requested.v1`) |
| POST | `/conversations/{id}:transfer-control` | Transfer/return control (AI↔Human↔Paused) | SalesExecutive | `{targetState}` → `{conversation}` (emits `conversation.control.transferred.v1`) |

> Control transitions are legal only along AI→Paused→Human and Human→AI; a paused AI must not
> send (DOMAIN_RULES BC-2). History is append-only and never silently mutated.

### 5.6 CRM — Contacts & Leads (+ Qualification)

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/contacts` | List contacts (deduped) | SalesExecutive | filters: `q`, `source` |
| GET | `/contacts/{id}` | Contact + linked leads + identities | SalesExecutive | → `{contact, leads}` |
| POST | `/contacts/{id}:merge` | Merge duplicate contacts | SalesManager | `{intoContactId}` → `{contact}` (emits `crm.contact.merged.v1`) |
| GET | `/leads` | List leads | SalesExecutive | filters: `stage`, `score`, `assignedTo=me`, `source`, `q`, date range |
| POST | `/leads` | Create lead | SalesExecutive | `{contactId, source, budget, config,...}` → `{lead}` (emits `crm.lead.created.v1`) |
| GET | `/leads/{id}` | Lead detail (stage, score, answers, activities) | SalesExecutive (own to modify) | → `{lead}` |
| PATCH | `/leads/{id}` | Update lead fields | SalesExecutive (assigned) | partial → `{lead}` (emits `crm.lead.updated.v1`) |
| POST | `/leads/{id}:change-stage` | Move pipeline stage | SalesExecutive (assigned) | `{toStage, reason?}` → `{lead}` (emits `crm.lead.stage.changed.v1`; `Lost` requires reason) |
| POST | `/leads/{id}:assign` | Assign/reassign executive | SalesManager | `{executiveId? \| strategy}` → `{lead}` (emits `crm.lead.assigned.v1`) |
| POST | `/leads/{id}/activities` | Log activity (note/call/msg) | SalesExecutive | `{type, body}` → `{activity}` (emits `crm.activity.logged.v1`) |
| GET | `/pipelines` | Org pipeline definition | SalesManager | → `{stages}` |
| GET | `/qualification-sets` | Configured question sets | SalesManager | → sets |
| PUT | `/qualification-sets/{id}` | Configure questions/weights | ClientOwner | `{questions, weights}` → `{set}` |
| POST | `/leads/{id}/qualification-answers` | Record answer (also via AI) | SalesExecutive | `{questionId, answer}` → `{leadScore}` (emits `qualification.answer.captured.v1` → `leadscore.updated.v1`) |
| GET | `/leads/{id}/score` | Current score + explaining factors | SalesExecutive | → `{value, category, factors[]}` |

> A Lead is never deleted (→ `Lost` with reason); no duplicate Contact for the same resolved
> person; every active Lead stays assigned (DOMAIN_RULES BC-6). The CRM score copy is derived
> from `leadscore.updated.v1`, never edited directly (BC-7).

### 5.7 Calls (live + artifacts)

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/calls` | List calls | SalesExecutive | filters: `direction`, `status`, `leadId`, date range |
| GET | `/calls/{id}` | Call detail + lifecycle | SalesExecutive | → `{call}` |
| POST | `/calls:outbound` | Place an AI outbound call | SalesManager | `{contactId, aiEmployeeId, consent}` → `202 {callId}` (emits `calls.started.v1`; consent-gated) |
| POST | `/calls/{id}:transfer` | Transfer live call to human | SalesExecutive | `{executiveId}` → `{call}` (emits `calls.transferred.v1`) |
| GET | `/calls/{id}/recording` | Signed short-lived recording URL | SalesExecutive | → `{url, expiresAt}` (tenant-prefixed S3, signed) |
| GET | `/calls/{id}/transcript` | Speaker-separated transcript | SalesExecutive | → `{segments[], version}` |
| GET | `/calls/{id}/summary` | AI summary + extracted requirements + sentiment | SalesExecutive | → `{summary, requirements, sentiment, actionItems}` |
| GET | `/calls/transcripts:search` | FTS across transcripts | SalesManager | `?q=` → matches |

> Recordings/transcripts are PII: signed short-lived URLs over tenant-prefixed keys only.
> Transcripts are versioned; CRM auto-update from a summary is traceable + reversible
> (DOMAIN_RULES BC-3/BC-8.Calls).

### 5.8 Campaigns

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/campaigns` | List campaigns | SalesManager | filters: `type`, `status` |
| POST | `/campaigns` | Create campaign (draft) | SalesManager | `{type, source, segment, steps}` → `{campaign}` (emits `campaign.created.v1`) |
| GET | `/campaigns/{id}` | Campaign detail + metrics | SalesManager | → `{campaign, stats}` |
| POST | `/campaigns/{id}:launch` | Launch / resume | SalesManager | `{}` → `{campaign}` (emits `campaign.launched.v1`) |
| POST | `/campaigns/{id}:pause` | Pause | SalesManager | `{}` → `{campaign}` |
| POST | `/campaigns/{id}/lead-lists:import` | Import a lead list (CSV/Meta/Google/CRM) | SalesManager | `{source, ...}` → `202 {importBatchId}` (emits `campaign.leadlist.imported.v1` → `…deduplicated.v1`) |
| GET | `/campaigns/{id}/outreach-attempts` | List attempts + outcomes | SalesManager | filters: `outcome` |
| GET | `/campaigns/{id}/follow-ups` | Follow-up rules + scheduled state | SalesManager | → rules/schedule |
| PUT | `/campaigns/{id}/follow-up-rules` | Configure follow-up rules | SalesManager | `{rules[]}` → `{campaign}` |
| POST | `/contacts/{id}:opt-out` | Record opt-out / DNC | SalesExecutive / Support | `{channel?}` → `{contact}` (emits `campaign.optout.recorded.v1`; stops all outreach) |

> Dedup runs before outreach; at-most-once per step; **all outreach stops immediately on
> opt-out/DNC or conversion**; per-tenant/per-provider rate limits respected (DOMAIN_RULES
> BC-4). Import & outreach are async.

### 5.9 Appointments

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/appointments` | List appointments | SalesExecutive | filters: `type`, `status`, `leadId`, date range |
| POST | `/appointments` | Book (site visit/virtual/phone) | SalesExecutive | `{leadId, type, slot, location?}` → `{appointment}` (emits `appointments.booked.v1`; validates slot vs business hours + availability) |
| GET | `/appointments/{id}` | Detail + reminders + calendar link | SalesExecutive | → `{appointment}` |
| POST | `/appointments/{id}:reschedule` | Reschedule | SalesExecutive | `{slot}` → `{appointment}` (emits `appointments.rescheduled.v1`) |
| POST | `/appointments/{id}:cancel` | Cancel | SalesExecutive | `{reason}` → `{appointment}` (emits `appointments.cancelled.v1`) |
| POST | `/appointments/{id}:complete` | Mark completed | SalesExecutive | `{outcome}` → `{appointment}` (emits `appointments.completed.v1`) |
| POST | `/appointments/{id}:no-show` | Record no-show | SalesExecutive | `{}` → `{appointment}` (emits `appointments.noshow.recorded.v1`; triggers reschedule follow-up) |

> No double-booking; respects org business hours + timezone; a booked appointment **must**
> reliably schedule confirmation + reminders (DOMAIN_RULES BC-8.Appt never-violate).

### 5.10 Notifications

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/notifications` | List my in-app notifications | any authed | filters: `unread`, `event` |
| POST | `/notifications/{id}:read` | Mark read | any authed | `{}` → `204` |
| POST | `/notifications:read-all` | Mark all read | any authed | `{}` → `204` |
| GET | `/notification-rules` | Org notification rules | ClientOwner | → rules |
| PUT | `/notification-rules` | Configure routing (event→channels/roles) | ClientOwner | `{rules[]}` → `{rules}` |

> Live delivery of the InApp channel is pushed over the WS `notifications` channel (§4.3).
> Delivery is idempotent; escalation/`WorkflowFailure` notifications are never silently dropped
> (DOMAIN_RULES BC-12).

### 5.11 Analytics

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/analytics/overview` | Dashboard KPIs (leads/calls/convos/appts) | SalesManager | `?from&to` → `{metrics}` |
| GET | `/analytics/leads` | Lead funnel, sources, conversion | SalesManager | `?from&to&groupBy` → series |
| GET | `/analytics/calls` | Call volume, duration, sentiment dist. | SalesManager | `?from&to` → series |
| GET | `/analytics/campaigns` | Campaign perf, CPL, ROAS | SalesManager | `?from&to&campaignId` → metrics |
| GET | `/analytics/agents` | Sales/agent + AI performance | SalesManager | `?from&to` → metrics |
| GET | `/analytics/response-time` | Response-time + hot-lead metrics | SalesManager | `?from&to` → metrics |

> Analytics is **read-only** read models from events; never authoritative, never writes back;
> tenant-scoped (DOMAIN_RULES BC-13). Served from the read replica.

### 5.12 Platform Ops / Admin (cross-tenant, audited)

| Method | Path | Purpose | Role | Request → Response |
|---|---|---|---|---|
| GET | `/admin/orgs/{id}/health` | Per-org system health | OperationsAdmin | audited |
| GET | `/admin/audit-log` | Read append-only audit log | SuperAdmin / OperationsAdmin | filters: `org`, `actor`, `action`, date |
| GET | `/admin/feature-flags` | List flags | OperationsAdmin | → flags |
| PUT | `/admin/feature-flags/{key}` | Toggle/scope a flag | SuperAdmin | `{value, scope}` → `{flag}` |
| GET | `/admin/queues` | BullMQ queue depths / DLQ | OperationsAdmin | → queue stats |

> All `/admin/**` access is **audit-logged**; the audit log is **append-only and never editable
> or deletable** through the application (DOMAIN_RULES BC-14).

---

## 6. Contract Testing

- **Single source of truth:** the zod schemas in `packages/contracts` are imported by (a) the
  NestJS validation pipes/serializers, (b) the generated typed client SDK consumed by
  `apps/web`, and (c) the contract test suite. A drift between server behavior and a schema is
  therefore a compile/test failure, not a runtime surprise.
- **Provider contract tests** (per context, in CI): for each endpoint in §5, assert the
  controller validates against and serializes through the named contract schema, including
  Problem Details on the failure paths and the standard envelopes (pagination §1.4, errors
  §1.6).
- **Webhook fixtures:** golden signed payloads per provider (§3) verify signature checks,
  dedupe, normalization to `InboundMessage`/lead-capture, and the emitted event — including
  the **rejection** paths (bad signature → `401`, replay → `200` no-op, unmapped tenant →
  drop+alert).
- **WS contract:** envelope shape (§4.2), handshake auth rejection, tenant-room authorization
  (cannot join another org's room), and event payloads validated against `packages/contracts`.
- **Cross-tenant access tests** are mandatory in CI (ARCHITECTURE §10/§14): every list/detail
  endpoint is exercised with a foreign-org principal and MUST return `404`/`403`, never another
  tenant's data.
- **Event contract tests** are owned by [`EVENT_CATALOG.md`](EVENT_CATALOG.md) (envelope +
  payload schemas, additive-only versioning, idempotent handlers).
