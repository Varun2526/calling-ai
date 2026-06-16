import { Controller, Get, UseGuards } from '@nestjs/common';
import { GetCurrentOrganizationQuery } from '../application/get-current-organization.query.js';
import { TenantGuard } from '../../../shared/tenant/tenant.guard.js';
import { PermissionsGuard } from './permissions.guard.js';
import { RequirePermissions } from './require-permissions.decorator.js';

/**
 * Presentation layer — translates HTTP to application use cases. No business logic, no
 * persistence. TenantGuard establishes the tenant; PermissionsGuard enforces RBAC via the
 * declared @RequirePermissions (ADR-0003).
 */
@Controller({ path: 'organizations', version: '1' })
@UseGuards(TenantGuard, PermissionsGuard)
export class OrganizationController {
  constructor(private readonly getCurrentOrg: GetCurrentOrganizationQuery) {}

  @Get('current')
  @RequirePermissions({ action: 'read', subject: 'Organization' })
  current(): Promise<{ id: string; name: string; status: string }> {
    return this.getCurrentOrg.execute();
  }
}
