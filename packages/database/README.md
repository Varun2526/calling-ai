# @propulse/database

The persistence platform for Propulse AI: the Prisma schema, the generated client,
the tenant-scoping extension, the Postgres Row-Level-Security policies, and the seed.

This package owns **how data is stored and isolated** — not business logic. Domain and
application logic live in `apps/api/src/contexts/*`; this package gives them a tenant-safe
client to talk to Postgres.

## Setup & common tasks

`DATABASE_URL` is read from the environment (see `.env.example`). All commands are
runnable through the workspace, e.g.:

```bash
pnpm --filter @propulse/database generate       # prisma generate (build the client)
pnpm --filter @propulse/database migrate:dev     # create + apply a dev migration
pnpm --filter @propulse/database migrate:deploy   # apply pending migrations (CI/prod)
pnpm --filter @propulse/database seed             # idempotent demo data (tsx prisma/seed.ts)
pnpm --filter @propulse/database build            # tsup -> dist (esm + cjs + d.ts)
```

> Migrations are **generated** by Prisma — do not hand-write SQL migration files.
> The RLS policies in `prisma/rls.sql` are applied as part of a migration so they
> are versioned alongside the schema.

## The three-layer tenant defense

Single database, shared schema, `organizationId` discriminator (see
`docs/ARCHITECTURE.md` §10). Isolation is enforced in depth — all three layers are
required, none is sufficient alone:

1. **App guard** — derives `organizationId` from the authenticated session (never the
   request body) and binds it to a request-scoped tenant context.
2. **Prisma tenant extension** (`src/tenant-middleware.ts`) — `forTenant(prisma, orgId)`
   returns a scoped client that auto-injects `where: { organizationId }` on reads and
   stamps `organizationId` onto writes, failing closed if it's missing. This is the
   developer-ergonomics + early-failure layer.
3. **Postgres RLS** (`prisma/rls.sql`) — policies key off the `app.current_org` GUC
   (`SET LOCAL app.current_org = '<orgId>'` per transaction). This is the
   database-enforced backstop that holds even if app code has a bug. A separate
   privileged role bypasses RLS only through audited super-admin paths.

```ts
import { PrismaClient, forTenant, TENANT_SCOPED_MODELS } from '@propulse/database';

const prisma = new PrismaClient();
const db = forTenant(prisma, organizationId);

await db.lead.findMany();                 // -> where: { organizationId }
await db.contact.create({ data: { ... }}); // -> organizationId stamped in
```

`TENANT_SCOPED_MODELS` is the registry of models carrying `organizationId`
(`User`, `Contact`, `Lead`, `OutboxEvent`, `AuditLog`). `Organization` is the tenant
root and is intentionally not scoped. Keep the registry, the schema, and `rls.sql`
in sync when adding tenant-scoped models.
