import type { Organization } from './organization.entity.js';

/**
 * Repository PORT (interface) — defined by the domain, implemented by infrastructure
 * (Dependency Inversion). The domain/application layers depend on this, never on Prisma.
 */
export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
}

export const ORGANIZATION_REPOSITORY = Symbol('OrganizationRepository');
