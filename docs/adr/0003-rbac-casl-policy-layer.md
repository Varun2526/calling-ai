# ADR-0003: Authorize with RBAC via a CASL-style policy layer; defer full ABAC

- **Status:** Accepted
- **Date:** 2026-06-16
- **Deciders:** Principal Architect, Security, IAM context owner
- **Tags:** authorization, rbac, security, iam

---

## Context

Authorization in Propulse AI is **two-dimensional**: _tenant scope_ ("which org's data" —
handled by [ADR-0001](0001-multi-tenancy-shared-schema-rls.md)) × _role-based permissions_
("what may this role do"). This ADR covers the second dimension.

The PRD defines a fixed set of roles spanning two tiers
([`ARCHITECTURE.md`](../ARCHITECTURE.md) §11, [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-1):
**platform roles** — Super Admin, Operations Admin — that span organizations, and **tenant
roles** — Client Owner, Sales Manager, Sales Executive, Pre-Sales Executive, Support — scoped
to exactly one org. Permissions are not purely role-flat: there are a few resource-level
refinements (e.g. a Sales Executive can _read_ all leads in their org but may only _modify_
leads assigned to them, configurable per org via the assignment rules).

The anti-pattern to avoid is scattering `if (role === 'SalesManager')` checks across
controllers and services — unauditable, untestable, and impossible to evolve. We need one
declarative place that answers "can this subject perform this action on this subject-type/
resource?" and a clear stance on how much attribute-based logic we take on now.

## Decision

**We will model authorization as RBAC expressed through a CASL-style ability/policy layer:
permissions are `(action, subject)` pairs evaluated against a per-request ability built from
the user's role + tenant scope, with a small number of resource-level conditions. Full ABAC is
deferred.**

- **Ability as data, not scattered conditionals.** Permissions are `(action, subject)` pairs —
  e.g. `update:Lead`, `read:Analytics`, `manage:Organization`. The IAM domain service
  `AuthorizationPolicy` builds a CASL-style ability from the user's role + scope
  ([`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-1). Call sites _check the ability_; they do not
  branch on role names.
- **Platform vs tenant tiers.** Super Admin / Operations Admin are platform roles and are the
  **only** roles permitted to cross tenant boundaries — and only through audited platform-admin
  endpoints (this is the same separate-role path RLS uses in
  [ADR-0001](0001-multi-tenancy-shared-schema-rls.md)). Tenant roles are confined to one org;
  tenant scope is always applied _first_, RBAC second.
- **Resource-level refinements as policy conditions.** The few attribute rules — chiefly
  "assigned-to-me" — are expressed as _conditions on the ability_ (e.g. `update:Lead` where
  `assignedTo == currentUserId`), fed by the CRM assignment rules, **not** as a separate ABAC
  engine. RBAC remains the spine.
- **Where it lives.** Route-level authorization policies live in each context's
  `presentation/policies/` ([`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §3);
  use-case-level authorization is enforced in the application layer
  ([`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §2). The domain stays pure — it knows
  invariants, not roles.
- **Audit.** Every authorization decision on a sensitive resource (and every cross-tenant
  platform action) is audit-logged via Platform Ops ([`DOMAIN_RULES.md`](../DOMAIN_RULES.md)
  BC-14, [`ARCHITECTURE.md`](../ARCHITECTURE.md) §11, §14).

## Consequences

- **Positive:**
  - One declarative, testable source of truth for permissions; unit tests can assert an
    ability matrix per role without spinning up controllers.
  - New permissions are additive (extend the ability builder), and the platform/tenant split
    composes cleanly with the tenant-scope layer.
  - Resource conditions ("assigned-to-me") are handled without the cost/complexity of a full
    ABAC engine.
- **Negative / accepted trade-offs:**
  - CASL-style abilities with row-level conditions can get subtle (especially conditional
    `update`); mis-modeled conditions are a security risk — mitigated by an ability test matrix
    in CI.
  - Deferring ABAC means genuinely attribute-rich policies (e.g. time-of-day, geo, deal-value
    thresholds) cannot be expressed yet; they would need a follow-up ADR.
- **Follow-ups / obligations:**
  - Maintain a per-role ability test matrix in `packages/testing`.
  - Ensure the cross-tenant platform-admin endpoints are the _only_ RLS/tenant-scope bypass and
    are fully audited (shared obligation with [ADR-0001](0001-multi-tenancy-shared-schema-rls.md)).

## Alternatives considered

| Option                                                               | Pros                                                                | Cons                                                                                    | Verdict                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **Scattered `if (role === …)` checks**                               | Trivial to start                                                    | Unauditable, untestable, rots fast; duplicated logic                                    | ❌ rejected — the exact anti-pattern we exist to avoid              |
| **Full ABAC / policy engine (e.g. OPA) from day one**                | Maximally expressive                                                | Heavyweight for a fixed PRD role set; new infra + latency; over-engineered for V1 needs | ❌ deferred — adopt only if attribute-rich policies actually arrive |
| **RBAC via CASL-style ability + a few resource conditions (chosen)** | Declarative, testable, fits the PRD roles, handles "assigned-to-me" | Conditional rules need care; not fully attribute-based                                  | ✅ **chosen**                                                       |

## Related

- Docs: [`ARCHITECTURE.md`](../ARCHITECTURE.md) §11 (authorization), §14 (security);
  [`DOMAIN_RULES.md`](../DOMAIN_RULES.md) BC-1 (IAM, `AuthorizationPolicy`), BC-6 (assignment),
  BC-14 (audit); [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md) §2;
  [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md) §3.
- ADRs: [ADR-0001](0001-multi-tenancy-shared-schema-rls.md) (tenant scope is applied before RBAC).
