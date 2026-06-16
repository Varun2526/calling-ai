# @propulse/workers

Async processors for Propulse AI — **one image, multiple BullMQ queue-bound process
types** (ARCHITECTURE.md §8/§9, REPOSITORY_STRUCTURE.md §5.7).

## What it is

BullMQ Workers consuming Redis-backed queues. Producers (`apps/api`, `apps/voice-gateway`)
enqueue; this app consumes. The transactional **Outbox relay** lives here too — it drains
committed `OutboxEvent` rows to the matching queues, giving **at-least-once** delivery with
no lost events on crash (ARCHITECTURE §8, ADR-0006).

## Hard rule

Workers contain **no new business logic** (AI_AGENT_GUIDELINES). Each processor is a thin
adapter that resolves tenant context and **invokes an application use case** from
`apps/api/src/contexts/<context>/application`, reused via shared packages — never
duplicated. Handlers are **idempotent** (dedupe by event id).

## Layout

- `src/main.ts` — bootstrap: wires config + logger, registers Workers, runs the outbox
  relay loop, drains on `SIGTERM`.
- `src/queues.ts` — central `<context>.<job>` queue registry (consts + types).
- `src/processors/` — `outbox-relay`, `ingestion`, `notifications`, ... (skeletons).

## Scripts

| Script | Action |
|---|---|
| `dev` | `tsx watch src/main.ts` |
| `build` | `tsc -p tsconfig.json` |
| `start` | `node dist/main.js` |
| `typecheck` | `tsc --noEmit` |
| `lint` | `eslint .` |
| `clean` | remove `dist` / `.turbo` |
