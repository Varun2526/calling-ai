# ADR-0001: Multi-tenancy via single database, shared schema, `organizationId` + Postgres RLS

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Principal Architect, Platform Lead, Security
- **Tags:** multi-tenancy, security, data, isolation

---

## Context

Propulse AI is a multi-tenant enterprise SaaS: many real-estate organizations (tenants) share
one platform, each holding highly sensitive PII — buyer phone numbers, budgets, call
recordings, transcripts. The most important non-functional property of the whole system is
**tenant isolation**: there must be no code path that reads or writes one tenant's data while
serving another. A cross-tenant leak is a catastrophic, potentially legal event (see
[`ARCHITECTURE.md`](../ARCHITECTURE.md) §14, §15).

For V1 the platform is **internally managed** (no public self-signup — orgs and users are
provisioned by platform admins via signed invitations, per the PRD). Tenant count is modest
but growing; we run a single Postgres (RDS) that also carries pgvector and full-text search.
We need an isolation model that is *strong if enforced*, cheap to operate, and does not make
cross-tenant platform analytics or schema migrations painful. The choice must be made now
because it determines the shape of every table, every repository, every cache key, and every
S3 prefix in the codebase — retrofitting it later is a rewrite.

## Decision

**We will use a single database with a shared schema, an `organizationId` discriminator on
every tenant-scoped row, defended in depth by three independent layers: an application tenant
guard, a Prisma tenant-scoping middleware, and Postgres Row-Level Security (RLS).**

All three layers are required — none is optional:

1. **Application tenant guard.** Derives `organizationId` from the *authenticated session*,
   never from the request body or query params, and binds it to a request-scoped tenant
   context. Requests without a resolvable tenant context (outside explicit platform-admin
   paths) are rejected.
2. **Prisma tenant-scoping middleware.** Auto-injects `where: { organizationId }` on every
   query against a tenant-scoped model and rejects writes that lack an `organizationId`. Every
   tenant-scoped model is registered with this middleware; registration is lint-enforced (see
   [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §5 rule 6 and
   [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §5 "Prisma tenant lint").
3. **Postgres RLS.** Policies key off a `SET app.current_org` GUC set per connection/
   transaction. This is the final backstop if application code has a bug — the database itself
   refuses to return other tenants' rows. Super-admin / Operations Admin use a **separate
   database role** that may bypass RLS *only* through audited platform-admin endpoints.

Tenant scoping extends beyond Postgres to every store: **Redis keys** (`org:{id}:...`),
**BullMQ job data** (every job carries `organizationId`), **S3 object prefixes**
(`s3://bucket/org/{id}/...`), and **pgvector queries** (filtered by `organizationId`). A
tenant's data must be physically impossible to address without its id.

This realizes invariant #1 in [`ARCHITECTURE.md`](../ARCHITECTURE.md) §0 and global invariant
#1 in [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) ("every aggregate carries an immutable
`organizationId`, set at creation, never changed").

## Consequences

- **Positive:**
  - Lowest operational cost: one schema, one migration run, one connection pool to reason
    about — no migration fan-out across N databases or schemas.
  - Cross-tenant *platform* analytics and super-admin views are trivial (one query, scoped by
    role) rather than requiring cross-database federation.
  - Defense-in-depth means a single-layer bug (e.g. a forgotten `where` clause) does not become
    a breach — RLS still refuses the rows.
  - Future extraction of a context to its own service does not change the tenancy model.
- **Negative / accepted trade-offs:**
  - Isolation is *logical*, not physical — a determined RLS/role misconfiguration could expose
    data. We accept this in exchange for operability, and compensate with the third layer plus
    CI tests. (DB-per-tenant would give physical isolation we judge premature for an
    internally-managed V1.)
  - "Single Postgres as everything" (OLTP + pgvector + FTS) creates a contention risk at scale
    (tracked in the [`DECISION_LOG.md`](../DECISION_LOG.md) risk register and
    [`ARCHITECTURE.md`](../ARCHITECTURE.md) §15); mitigated by a read replica and documented
    extraction ramps.
  - Every developer and AI agent must remain disciplined: any new tenant-scoped model is a
    potential leak if not registered with the middleware and given an RLS policy.
- **Follow-ups / obligations:**
  - **Automated cross-tenant access tests in CI** (a tenant test harness in
    `packages/testing`) that assert tenant A can never read/write tenant B's rows through any
    layer — this is the regression net for the chosen model.
  - RLS policy templates + the `SET app.current_org` plumbing live in `packages/database`.
  - The Prisma tenant-lint check must fail the build on any unregistered tenant-scoped model.

## Alternatives considered

| Option | Isolation | Ops cost | Cross-tenant analytics | Verdict |
|---|---|---|---|---|
| **Database per tenant** | Strongest (physical) | High — migrations × N, connection sprawl, provisioning automation | Hard (cross-DB federation) | ❌ premature for an internally-managed V1; physical isolation not yet worth the ops burden |
| **Schema per tenant** | Strong | Medium-high — same migration fan-out pain | Medium | ❌ same migration cost as DB-per-tenant for only marginal isolation gain over RLS |
| **Shared schema + `organizationId` + RLS (chosen)** | Strong *if enforced in depth* | Low | Easy | ✅ **chosen** — best isolation-per-ops-dollar given V1 constraints, with a clean exit ramp |

The exit ramp is real: because every row already carries `organizationId` and high-volume
tables are partition-ready by `organizationId` ([`ARCHITECTURE.md`](../ARCHITECTURE.md) §12),
a future move to schema- or DB-per-tenant for a large/regulated tenant is additive, not a
rewrite.

## Related

- Docs: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §10 (multi-tenancy), §14 (security), §15
  (risks); [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) global invariants;
  [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §5 rule 6;
  [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §5.
- ADRs: [ADR-0003](0003-rbac-casl-policy-layer.md) (authorization sits *on top of* tenant
  scope); [ADR-0006](0006-event-bus-and-outbox.md) (every job/event carries `organizationId`).
