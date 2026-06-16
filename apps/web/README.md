# @propulse/web

Next.js 14 (App Router) frontend for Propulse AI — the **client dashboard** and the
**super-admin console**. Feature-first organization (see
[`docs/REPOSITORY_STRUCTURE.md`](../../docs/REPOSITORY_STRUCTURE.md)).

## Layout

- `app/(client)` — tenant-facing dashboard (leads, conversations, calls, campaigns, …)
- `app/(admin)` — super-admin / ops console (organizations, users, audit logs, system health)
- `app/(auth)` — login + accept-invite (**no public signup** — Ops provisions users)
- `features/<feature>` — vertical UI slices (components, hooks, api-client, schemas)
- `components/` — shared, feature-agnostic app UI (composes `@propulse/ui`)
- `lib/` — client utils, the typed API client
- `styles/` / `app/globals.css` — Tailwind + shadcn-style tokens

## Scripts

```bash
pnpm dev        # next dev -p 3000
pnpm build      # next build
pnpm start      # next start -p 3000
pnpm lint       # eslint .
pnpm typecheck  # tsc --noEmit
pnpm clean      # remove .next / .turbo / node_modules
```

Depends on workspace packages `@propulse/ui` and `@propulse/contracts`
(transpiled by Next via `transpilePackages`).
