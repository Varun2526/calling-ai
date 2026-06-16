import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@propulse/database';
import { TenantContextStore } from '../tenant/tenant-context.js';

/**
 * PrismaService — the single PrismaClient for the process. The `scoped()` helper returns a
 * client bound to the active tenant: it (1) applies the @propulse/database tenant extension
 * AND (2) sets the Postgres `app.current_org` GUC so Row-Level Security policies activate.
 * Together with the TenantGuard this is the three-layer tenant defense (ARCHITECTURE §10).
 *
 * Repositories in each context's infrastructure layer depend on this service — domain and
 * application layers never see Prisma.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run a unit of work with the tenant GUC set for RLS. Use within a transaction so
   * `SET LOCAL` is scoped to the connection for the duration of the work.
   */
  async withTenant<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    const ctx = TenantContextStore.getOrThrow();
    return this.$transaction(async (tx) => {
      // SET LOCAL keeps the GUC scoped to this transaction/connection only.
      await tx.$executeRawUnsafe(`SET LOCAL app.current_org = '${ctx.organizationId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
