// Public surface of @propulse/database.
//
// Consumers import the generated client + the tenant-scoping factory from here:
//   import { PrismaClient, forTenant, TENANT_SCOPED_MODELS } from '@propulse/database';

// Re-export the generated Prisma client and its types/enums so consumers depend on
// this package rather than @prisma/client directly. (The generated client must be
// produced via `prisma generate`; it is not bundled — see tsup.config.ts.)
export { Prisma, PrismaClient } from '@prisma/client';
export type {
  Organization,
  User,
  Contact,
  Lead,
  OutboxEvent,
  AuditLog,
  OrganizationStatus,
  UserStatus,
  Role,
  LeadStage,
} from '@prisma/client';

// Tenant scoping (Layer 2 of the three-layer defense — see tenant-middleware.ts).
export {
  forTenant,
  isTenantScopedModel,
  TENANT_SCOPED_MODELS,
  MissingTenantContextError,
} from './tenant-middleware.js';
export type { TenantScopedClient, TenantScopedModel } from './tenant-middleware.js';
