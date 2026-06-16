import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
} from '../domain/organization.repository.js';
import { TenantContextStore } from '../../../shared/tenant/tenant-context.js';

/**
 * Application use case (query). Orchestrates the domain via ports; contains no business rules
 * and no I/O details. Reads the tenant from the request context — never from caller input.
 */
@Injectable()
export class GetCurrentOrganizationQuery {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
  ) {}

  async execute(): Promise<{ id: string; name: string; status: string }> {
    const { organizationId } = TenantContextStore.getOrThrow();
    const org = await this.organizations.findById(organizationId);
    if (!org) throw new NotFoundException('Organization not found');
    return { id: org.id, name: org.name, status: org.status };
  }
}
