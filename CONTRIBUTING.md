# Contributing to Propulse AI

Thanks for contributing. This is the **practical** guide — the short version of how we work day to
day. The full, authoritative rules live in the docs; this page tells you what to do and points you
there for the why.

> **Owner:** Engineering Manager · **Audience:** every engineer and AI agent touching this repo.

## Quick links

- **Engineering standards (the rulebook):** [`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md)
- **System architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Repository structure:** [`docs/REPOSITORY_STRUCTURE.md`](docs/REPOSITORY_STRUCTURE.md)
- **Clean architecture / boundary rules:** [`docs/CLEAN_ARCHITECTURE.md`](docs/CLEAN_ARCHITECTURE.md)
- **First-time setup:** [`docs/ONBOARDING_GUIDE.md`](docs/ONBOARDING_GUIDE.md)
- **How to add a feature:** [`docs/FEATURE_BLUEPRINT.md`](docs/FEATURE_BLUEPRINT.md)
- **Event registry:** [`docs/EVENT_CATALOG.md`](docs/EVENT_CATALOG.md) · **API:** [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md)
- **Decisions:** [`docs/adr/`](docs/adr/)

---

## 1. Setup

Follow [`docs/ONBOARDING_GUIDE.md`](docs/ONBOARDING_GUIDE.md) for the full walkthrough. The short path:

```bash
# prerequisites: the Node version in .nvmrc, and pnpm
nvm use
corepack enable && corepack prepare pnpm@latest --activate

pnpm install                 # install the whole workspace
cp .env.example .env         # fill in local values (no secrets committed)
docker compose up -d         # local postgres+pgvector, redis, mailhog, localstack(S3)
pnpm --filter @propulse/database migrate:dev   # apply migrations + seed
pnpm dev                     # run apps via Turborepo
```

If anything in setup is wrong or stale, fix `docs/ONBOARDING_GUIDE.md` in your PR — onboarding docs
are everyone's responsibility.

---

## 2. Branch, commit, and PR rules (summary)

Full detail: [`docs/ENGINEERING_STANDARDS.md`](docs/ENGINEERING_STANDARDS.md) §2–§4.

**Branches** — trunk-based, short-lived off `main`, named `<type>/<ticket>-<slug>`:

```
feat/PROP-412-lead-scoring-engine
fix/PROP-588-webhook-signature-replay
chore/PROP-601-bump-prisma-5
```

`main` is protected: no direct pushes, PR required, CI green, ≥1 approval including a CODEOWNER.

**Commits** — [Conventional Commits](https://www.conventionalcommits.org/), scope = bounded context or package:

```
feat(crm): add Lead aggregate with assignment invariants
fix(voice): verify Twilio signature before processing media webhook
refactor(qualification): extract ScoringEngine out of CreateLeadHandler
```

If the commit was AI-assisted, add the footer:

```
Co-Authored-By: Claude <noreply@anthropic.com>
```

**PRs** — keep them small (≤250 net lines is ideal, >800 is blocked). Link the ticket, fill in the PR
template, get a CODEOWNER approval. One PR does one thing.

---

## 3. Run lint / test / boundaries locally

Run these before pushing — they are the same gates CI enforces:

```bash
pnpm lint          # eslint incl. import/boundary rules
pnpm typecheck     # TypeScript across the workspace
pnpm test          # unit + integration (incl. cross-tenant isolation tests)
pnpm boundaries    # dependency-cruiser + domain-purity grep + Prisma tenant lint
pnpm build         # all apps build
pnpm test:e2e      # end-to-end flows (when touching critical paths)
```

Scope to one package while iterating, e.g. `pnpm --filter @propulse/api test`.

---

## 4. The boundary rules (and how CI enforces them)

These rules keep our modular monolith extractable instead of rotting into a big ball of mud. Full
rules + the allowed-import matrix: [`docs/CLEAN_ARCHITECTURE.md`](docs/CLEAN_ARCHITECTURE.md).

1. **Domain purity** — nothing in any `domain/` folder imports `@nestjs`, `@prisma`, `bullmq`,
   `ioredis`, `aws-sdk`, `axios`, or touches `process.env`. The domain is pure and unit-testable.
2. **No cross-context internals** — a context may import another context's _published application
   interface_ or _contracts/events_ only — never its `domain/` or `infrastructure/`.
3. **No cross-context table access** — one context's Prisma models/tables are private. Cross-context
   data flows via a published query or a domain event.
4. **Side effects are events** — don't call another context's service inline; emit an event to the
   outbox (e.g. `crm.lead.created.v1`).
5. **Tenant scoping** — every tenant-scoped model has `organization_id` and is registered with the
   tenant middleware; `organizationId` comes from auth, never the request body.
6. **Env via `packages/config`** — no scattered `process.env`.

**How CI enforces it** (a violation is a _build failure_, not a review comment):

| Gate                                                           | Catches                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------- |
| `eslint` (`no-restricted-imports`, `eslint-plugin-boundaries`) | illegal layer/context imports                              |
| `dependency-cruiser` (`pnpm boundaries`)                       | the import matrix + no cross-context internals + no cycles |
| domain-purity grep                                             | framework/infra imports or `process.env` inside `domain/`  |
| Prisma tenant lint                                             | tenant-scoped models missing `organization_id`/middleware  |
| `architecture.spec.ts` fitness test                            | layer dependency assertions                                |

The **only** way to relax a boundary is an ADR that updates `CLEAN_ARCHITECTURE.md` _and_ the lint
config in the same PR.

---

## 5. How to add a feature

Start from the blueprint: [`docs/FEATURE_BLUEPRINT.md`](docs/FEATURE_BLUEPRINT.md). In short:

1. Write/declare a feature spec in `docs/feature-specs/` from the blueprint template.
2. Identify the owning **bounded context**; work inside `apps/api/src/contexts/<context>/` following
   the `domain → application → infrastructure → presentation` layout.
3. Put shared DTO/event schemas in `packages/contracts` (zod). Cross-context effects = events.
4. Add the UI as a vertical slice in `apps/web/features/<feature>/`.
5. Add tests at the right levels and a **cross-tenant isolation test** (see standards §9).
6. Update `EVENT_CATALOG.md` / `API_CONTRACTS.md` / `.env.example` as needed.

---

## 6. How to add an ADR

Architecturally significant decisions are recorded as immutable, append-only ADRs in
[`docs/adr/`](docs/adr/). Copy the latest ADR as a template, number it next in sequence
(`NNNN-short-title.md`), and include: context, decision, alternatives considered, consequences. If
the ADR relaxes a boundary, ship the lint-config change in the **same PR**. Get an architect's review.

---

## 7. Code of conduct

Be respectful, assume good intent, and critique code, not people. Review comments are about the
change; keep them specific and actionable (use `nit:` for non-blocking suggestions). Harassment or
discrimination is not tolerated. Raise concerns to the Engineering Manager.

---

## 8. Where to ask questions

- **Architecture / boundaries:** ask an architect (see `CODEOWNERS`) or open a discussion thread.
- **A specific context:** ping that context's owner in `CODEOWNERS`.
- **Setup / tooling:** the Platform team; check [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) first.
- **Anything unclear in these docs:** open a PR fixing the doc — that's the fastest answer for the next person.
