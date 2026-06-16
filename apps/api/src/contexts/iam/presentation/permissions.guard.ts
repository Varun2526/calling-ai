import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Ability, type Role } from '../domain/authorization.js';
import { PERMISSIONS_KEY, type RequiredPermission } from './require-permissions.decorator.js';

/**
 * Route-level authorization. Builds the caller's Ability from the verified principal's roles
 * and checks every @RequirePermissions entry (deny-by-default). Runs after TenantGuard, so
 * tenant scope is already established (ARCHITECTURE §11).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const roles = (req.principal?.roles ?? []) as Role[];
    const ability = Ability.forRoles(roles);

    const ok = required.every((p) => ability.can(p.action, p.subject));
    if (!ok) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }
    return true;
  }
}
