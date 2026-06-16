# ADR-NNNN: <short, decisive title in the present tense>

> Copy this file to `adr/NNNN-kebab-case-title.md`, fill every section, and link it from
> [`../DECISION_LOG.md`](../DECISION_LOG.md). ADRs are **immutable, append-only**: once
> Accepted, you do not edit the decision — you supersede it with a new ADR and flip this one's
> status to `Superseded by ADR-XXXX`.

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Deciders:** <names/roles — at minimum the accountable architect>
- **Tags:** <e.g. multi-tenancy, security, architecture, infra>

---

## Context

What forces are at play? State the problem, the constraints (product, PRD, regulatory,
team, time, cost), and _why a decision is needed now_. Be concrete and reference the
relevant section of [`ARCHITECTURE.md`](../ARCHITECTURE.md),
[`DOMAIN_RULES.md`](../DOMAIN_RULES.md), [`REPOSITORY_STRUCTURE.md`](../REPOSITORY_STRUCTURE.md),
or [`CLEAN_ARCHITECTURE.md`](../CLEAN_ARCHITECTURE.md). A reader six months from now should
understand the world as it was when we chose, without prior knowledge.

## Decision

The decision, stated plainly and in the active voice: **"We will …"**. Include the specifics
that make it actionable — components, boundaries, naming rules, enforcement. If there are
non-negotiable invariants that fall out of this decision, list them. Avoid hedging; an ADR
records a commitment, not a discussion.

## Consequences

The results of the decision — _both_ good and bad. What becomes easy? What becomes harder?
What new obligations, risks, or follow-up work does this create (migrations, lint rules,
tests, runbooks)? Name the trade-offs we are knowingly accepting so nobody relitigates them
without new information.

- **Positive:** …
- **Negative / accepted trade-offs:** …
- **Follow-ups / obligations:** …

## Alternatives considered

For each rejected option: a one-line description and _why it lost_. A comparison table is
encouraged when the trade-off space is multi-dimensional.

| Option | Pros | Cons | Verdict                |
| ------ | ---- | ---- | ---------------------- |
| …      | …    | …    | ❌ rejected — <reason> |

## Related

- ADRs: <ADR-XXXX (supersedes/relates), …>
- Docs: <links to the architecture sections this implements/refines>
- Issues/PRs: <optional>
