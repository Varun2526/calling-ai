import { Controller, Get, UseGuards } from '@nestjs/common';
import { GetCurrentOrganizationQuery } from '../application/get-current-organization.query.js';
import { TenantGuard } from '../../../shared/tenant/tenant.guard.js';

/**
 * Presentation layer — translates HTTP to application use cases. No business logic, no
 * persistence. Tenant scope is enforced by TenantGuard + the tenant interceptor.
 */
@Controller({ path: 'organizations', version: '1' })
@UseGuards(TenantGuard)
export class OrganizationController {
  constructor(private readonly getCurrentOrg: GetCurrentOrganizationQuery) {}

  @Get('current')
  current(): Promise<{ id: string; name: string; status: string }> {
    return this.getCurrentOrg.execute();
  }
}
