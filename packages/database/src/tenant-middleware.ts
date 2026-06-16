import { Prisma, PrismaClient } from '@prisma/client';

/**
 * Tenant scoping — Layer 2 of the three-layer defense (docs/ARCHITECTURE.md §10).
 *
 *   1. App guard       — derives `organizationId` from the authenticated session.
 *   2. THIS extension  — auto-injects `organizationId` into every query/write for
 *                        tenant-scoped models, and rejects writes that lack it.
 *   3. Postgres RLS    — the database-enforced backstop (prisma/rls.sql).
 *
 * This is DEFENSE IN DEPTH **with** RLS, not instead of it. RLS is the ground
 * truth that holds even if this extension is bypassed or has a bug; this layer
 * exists to (a) make correct queries the default for application code, (b) fail
 * loudly and early on a missing tenant id, and (c) keep the `organizationId`
 * plumbing out of every call site. Never rely on this layer alone for isolation.
 */

/**
 * The registry of tenant-scoped Prisma models. Every model here carries an
 * `organizationId` column and is subject to auto-scoping below. `Organization`
 * itself is intentionally absent — it IS the tenant, not a tenant-scoped row.
 *
 * Keep this in sync with prisma/schema.prisma. Adding a tenant-scoped model
 * without registering it here is a tenant-isolation bug.
 */
export const TENANT_SCOPED_MODELS = [
  'User',
  'Contact',
  'Lead',
  'OutboxEvent',
  'AuditLog',
] as const satisfies readonly Prisma.ModelName[];

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

const TENANT_SCOPED_MODEL_SET: ReadonlySet<string> = new Set(TENANT_SCOPED_MODELS);

export function isTenantScopedModel(model: string | undefined): model is TenantScopedModel {
  return model !== undefined && TENANT_SCOPED_MODEL_SET.has(model);
}

/** Thrown when a tenant-scoped operation is attempted without a tenant context. */
export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Tenant-scoped operation "${operation}" on model "${model}" requires an ` +
        `organizationId. Use forTenant(prisma, organizationId) instead of the raw client.`,
    );
    this.name = 'MissingTenantContextError';
  }
}

// Operations whose top-level argument carries a `where` we should constrain.
const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
  'update',
  'delete',
]);

// Operations whose `data` we should stamp with organizationId.
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'upsert']);

function injectWhere(args: Record<string, unknown>, organizationId: string): Record<string, unknown> {
  const existingWhere = (args.where as Record<string, unknown> | undefined) ?? {};
  return { ...args, where: { ...existingWhere, organizationId } };
}

function stampData(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => ({ organizationId, ...(row as object) }));
  }
  // Spread org first so callers cannot override it by passing a different one.
  return { organizationId, ...(data as object) };
}

/**
 * Returns a Prisma client whose calls to tenant-scoped models are automatically
 * constrained to `organizationId`:
 *   - reads / updates / deletes get `where.organizationId` injected;
 *   - creates / upserts get `organizationId` stamped into `data` (and `create`/
 *     `update` branches of upsert);
 *   - calls against tenant-scoped models with no recognizable args fail closed.
 *
 * Non-tenant-scoped models (e.g. Organization) pass through untouched. The raw
 * escape hatch ($queryRaw etc.) is NOT scoped here — those paths rely on RLS and
 * must set `app.current_org` themselves.
 *
 * @example
 *   const db = forTenant(prisma, orgId);
 *   await db.lead.findMany();              // -> where: { organizationId: orgId }
 *   await db.contact.create({ data: {...} }); // -> organizationId stamped in
 */
export function forTenant(prisma: PrismaClient, organizationId: string) {
  if (!organizationId) {
    throw new Error('forTenant() requires a non-empty organizationId.');
  }

  return prisma.$extends({
    name: 'tenant-scoping',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          if (!isTenantScopedModel(model)) {
            return query(args);
          }

          const typedArgs = (args ?? {}) as Record<string, unknown>;

          if (CREATE_OPERATIONS.has(operation)) {
            const next: Record<string, unknown> = { ...typedArgs };

            if ('data' in next) {
              next.data = stampData(next.data, organizationId);
            }
            // upsert also carries create/update + a where to constrain.
            if (operation === 'upsert') {
              if ('create' in next) next.create = stampData(next.create, organizationId);
              if ('update' in next) next.update = stampData(next.update, organizationId);
              return query(injectWhere(next, organizationId));
            }
            return query(next);
          }

          if (WHERE_OPERATIONS.has(operation)) {
            return query(injectWhere(typedArgs, organizationId));
          }

          // Unknown operation against a tenant-scoped model: fail closed.
          throw new MissingTenantContextError(model, operation);
        },
      },
    },
  });
}

/** The scoped client type returned by {@link forTenant}. */
export type TenantScopedClient = ReturnType<typeof forTenant>;
