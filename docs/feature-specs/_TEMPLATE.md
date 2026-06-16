---
feature: '<Feature name — short, human-readable>'
slug: 'NNNN-short-slug' # matches the filename; 4-digit, zero-padded, increasing
owner: '<name / GitHub handle>' # the DRI; co-owners = CODEOWNERS of touched contexts
status: 'Draft' # Draft | In Review | Approved | In Progress | Shipped | Superseded
target_release: '<release / sprint>'
related_adrs: [] # e.g. ["adr/0007-...md"] — required if architecturally significant
bounded_contexts: [] # owning + collaborating, e.g. ["channels", "conversation", "crm"]
created: '<YYYY-MM-DD>'
last_updated: '<YYYY-MM-DD>'
---

# <Feature name>

> Copied from [`_TEMPLATE.md`](./_TEMPLATE.md). Follow [`../FEATURE_BLUEPRINT.md`](../FEATURE_BLUEPRINT.md).
> All 14 sections are required. A section may be `N/A — <reason>` but never deleted.
> Keep this spec current through delivery; set `status: Shipped` when done.

---

## 1. Business requirement

<!-- The problem, the user, the value, the measurable outcome — in business language.
     Name the actor (PRD role / buyer / AI Employee) and the job to be done. -->

- **Actor / role:** <who>
- **Problem / job to be done:** <what they're trying to achieve>
- **Value & target metric:** <metric this moves + current baseline>
- **In scope:** <bullets>
- **Out of scope:** <bullets — make the boundary explicit>
- **PRD / product reference:** <link>

## 2. Acceptance criteria (Gherkin-style)

<!-- Given/When/Then. Cover happy path, alternates, failures/edges. Include >=1 cross-tenant
     isolation scenario and latency scenarios where budgets apply (text <2s, voice <1.2s). -->

```gherkin
Scenario: <happy path>
  Given <precondition>
  When <action>
  Then <observable outcome>

Scenario: <failure / edge>
  Given <precondition>
  When <action that fails>
  Then <safe, observable handling>

Scenario: Tenant isolation
  Given a user in Organization A
  When they attempt to access data created by Organization B via this feature
  Then access is denied and nothing about Org B is revealed
```

## 3. Domain analysis

<!-- DDD impact. Reference DOMAIN_RULES.md. -->

- **Owning context:** <context>
- **Collaborating contexts (relationship):** <ctx — upstream/downstream/customer-supplier>
- **Aggregates touched:** <Aggregate — created|mutated; one aggregate per transaction>
- **New / changed value objects:** <VO — why a primitive won't do>
- **Invariants to preserve (from DOMAIN_RULES):** <list>
- **New invariants introduced:** <list, as testable assertions>
- **Never-violate rules in play:** <list>
- **Cross-boundary effects:** expressed as events / IDs only? <yes — list them in §6>

## 4. Database changes

<!-- Prisma models in packages/database. Every tenant model: organizationId + middleware + RLS.
     Migration reversible/additive. Indexes (lead with organizationId). RLS policy per table. -->

- **Prisma model changes (`packages/database`):**
  ```prisma
  // model sketch — new/changed models, fields, enums, relations
  ```
- **`organizationId` + tenant middleware:** <per model — confirmed>
- **Migration:** `<migration_name>` — reversible? <yes / expand-contract plan>
- **Indexes / uniqueness:** <e.g. @@index([organizationId, ...]), @@unique([organizationId, ...]), FTS/pgvector>
- **RLS policy:** <predicate on app.current_org per new table>
- **Partitioning intent (high-volume append tables):** <N/A | plan>

## 5. API contracts

<!-- Endpoints + zod schemas in packages/contracts. Auth (CASL). Pagination. Problem-details.
     Map domain -> DTO; never expose entities. WS: tenant room + envelope. -->

- **Endpoints:**
  | Method | Path | Auth (action:subject) | Request DTO | Response DTO | Notes |
  |---|---|---|---|---|---|
  | <GET/POST> | `/...` | `<read:Lead>` | `<DTO>` | `<DTO>` | paginated? errors? |
- **`packages/contracts` schemas (zod):** <DTOs, enums, ids>
- **WebSocket:** <channel/room (tenant-scoped), envelope schema, pushed events>
- **`API_CONTRACTS.md` updated:** <yes/no>

## 6. Event definitions

<!-- <context>.<aggregate>.<pastTenseFact>.v<major>. Payload = IDs + organizationId only.
     Written to Outbox in same tx. Idempotent consumers. Register in EVENT_CATALOG.md. -->

- **Emitted:**
  | Event | Payload (zod in contracts) | Accompanies (aggregate change) | Fact asserted |
  |---|---|---|---|
  | `<ctx.aggregate.fact.v1>` | <ids + organizationId> | <change> | <fact> |
- **Consumed:**
  | Event | Handler (context) | Idempotency key |
  |---|---|---|
  | `<ctx.aggregate.fact.v1>` | <context.handler> | <key> |
- **Changed (version bump):** <event — migration / dual-publish plan>
- **`EVENT_CATALOG.md` updated:** <yes/no>

## 7. Backend implementation plan (by layer)

<!-- domain -> application -> infrastructure -> presentation. Name real folders from
     REPOSITORY_STRUCTURE.md. Dependencies point inward. Ports in domain, adapters in infra. -->

- **Domain** (`contexts/<c>/domain/`): <entities / VOs / services / ports / events>
- **Application** (`contexts/<c>/application/`): <commands / queries / event-handlers; tx + Outbox write; authz>
- **Infrastructure** (`contexts/<c>/infrastructure/`): <Prisma repos / adapters / mappers / queue producers>
- **Presentation** (`contexts/<c>/presentation/`): <controllers / WS gateways / CASL policies>
- **Workers** (`apps/workers/src/processors/`): <processors invoking use cases>
- **Voice-gateway** (`apps/voice-gateway/`): <N/A | realtime reuse>
- **Module wiring** (`<c>.module.ts`): <what is wired>

## 8. Frontend implementation plan

<!-- Next.js route group + features/<feature> slice. @propulse/ui via components/. api-client +
     contracts schemas. WS subscription (tenant room). States + role-gating. -->

- **Route(s):** `apps/web/app/(client|admin)/...`
- **Feature slice:** `apps/web/features/<feature>/` — <components / hooks / api-client / schemas>
- **Shared UI:** <@propulse/ui primitives via apps/web/components/>
- **Data fetching:** <server components/loaders | client hooks>
- **WebSocket:** <tenant room, live updates>
- **States & role-gating:** <loading/empty/error; which roles see what>

## 9. Infrastructure requirements

<!-- Queues, S3, Redis, third parties, IaC. Everything tenant-scoped. Secrets in Secrets Manager.
     New env vars in .env.example + packages/config. -->

- **Queues (BullMQ):** <queue, processor, concurrency, per-tenant rate limit, retry/backoff, DLQ; organizationId in payload>
- **S3:** <bucket/prefix s3://.../org/{id}/...; signed short-lived URLs; KMS>
- **Redis:** <key pattern org:{id}:...; TTL; invalidation; pub/sub channel>
- **Third parties:** <provider config; webhook signature verification; secrets location>
- **IaC (`infra/`):** <ECS changes; env vars; alarms/dashboards; IAM least-privilege>

## 10. Testing requirements

<!-- unit / integration / contract / e2e / cross-tenant (MANDATORY). Latency assertions. -->

- **Unit (domain):** <pure VO/invariant/service tests>
- **Integration (application + infra):** <use cases vs real DB; Outbox; handler idempotency>
- **Contract:** <request/response + event payloads vs contracts zod>
- **E2E:** <each §2 scenario; Playwright for UI>
- **Cross-tenant (MANDATORY):** <Org A cannot reach Org B via endpoints/queues/cache/S3>
- **Latency:** <assertions where budgets apply>

## 11. Documentation updates

<!-- Which docs change + ADR if significant. -->

- **Docs to update:** <EVENT_CATALOG.md / API_CONTRACTS.md / DOMAIN_RULES.md / REPOSITORY_STRUCTURE.md / runbooks / TROUBLESHOOTING.md>
- **ADR required?** <no | adr/NNNN-... — title>

## 12. Monitoring requirements

<!-- CloudWatch metrics/alarms, Sentry, logs, SLOs. Tenant-tagged. No PII in tags/logs. -->

- **Metrics (CloudWatch):** <counters/timers, dimensioned by organizationId where feasible>
- **Alarms:** <thresholds tied to SLOs; queue depth/age; DLQ>0; error rate; provider failures; routing>
- **Sentry:** <tags: tenant, correlation/conversation id; no PII>
- **Logs:** <structured, correlation-id, tenant-tagged; no secrets/PII>
- **SLOs:** <e.g. text turn <2s p95; how measured>

## 13. Rollback strategy

<!-- Feature flag, migration reversibility, backward-compatible events, idempotency on replay. -->

- **Feature flag:** <name; per-org?; default-off; enable/disable procedure>
- **Migration reversibility:** <reversible | expand/contract steps>
- **Event back-compat:** <additive | dual-publish across major bump; consumers ignore unknown fields>
- **Idempotency on replay:** <keys ensuring no double-apply>
- **Kill switch / blast radius:** <explicit steps; what's affected>

## 14. Definition of Done

- [ ] Spec approved and current; `status: Shipped`.
- [ ] All §2 acceptance scenarios implemented and passing as tests.
- [ ] Boundaries pass: `pnpm boundaries`, domain-purity grep, `architecture.spec.ts`.
- [ ] Every tenant model: `organizationId` + middleware + RLS; **cross-tenant test passes**.
- [ ] Contracts/events in `packages/contracts`, `API_CONTRACTS.md`, `EVENT_CATALOG.md`.
- [ ] Unit/integration/contract/e2e/cross-tenant tests green in CI.
- [ ] Metrics, alarms, Sentry tags, logs, SLOs in place.
- [ ] Behind feature flag; rollback + migration reversibility verified.
- [ ] Docs updated; ADR written if architecturally significant.
- [ ] Secrets in Secrets Manager; new env vars in `.env.example` + `packages/config`.
- [ ] Latency budgets met where applicable.
- [ ] Reviewed by owning context CODEOWNERS (+ architect for boundary changes).
