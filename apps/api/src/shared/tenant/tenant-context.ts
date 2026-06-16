import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Request-scoped tenant context, propagated via AsyncLocalStorage so any layer can read
 * the active organizationId/user WITHOUT threading it through every function signature.
 *
 * The organizationId is set ONLY from the authenticated session by the TenantGuard — never
 * from a request body or query param (ARCHITECTURE §10/§11). This is the first of the three
 * defense-in-depth layers (guard -> Prisma scoping -> Postgres RLS).
 */
export interface TenantContext {
  readonly organizationId: string;
  readonly userId: string;
  readonly roles: string[];
  /** Platform roles (SuperAdmin/OperationsAdmin) may cross tenants via audited endpoints. */
  readonly isPlatformActor: boolean;
  readonly correlationId: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export const TenantContextStore = {
  run<T>(ctx: TenantContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): TenantContext | undefined {
    return storage.getStore();
  },
  getOrThrow(): TenantContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('No tenant context: a tenant-scoped operation ran outside a request.');
    }
    return ctx;
  },
};
