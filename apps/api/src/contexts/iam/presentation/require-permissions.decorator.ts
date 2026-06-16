import { SetMetadata } from '@nestjs/common';
import type { Action, Subject } from '../domain/authorization.js';

export const PERMISSIONS_KEY = 'required_permissions';

export interface RequiredPermission {
  action: Action;
  subject: Subject;
}

/**
 * Declares the permission(s) a route requires, e.g. `@RequirePermissions({ action: 'read',
 * subject: 'Organization' })`. Evaluated by PermissionsGuard against the caller's Ability.
 */
export const RequirePermissions = (...permissions: RequiredPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
