/**
 * Authorization policy (RBAC) — pure domain logic, no framework (ADR-0003).
 *
 * Two-dimensional authz (ARCHITECTURE §11): tenant scope (handled by the TenantGuard +
 * RLS) answers "which org's data"; this answers "what may this role do". Permissions are
 * modelled as (action, subject) pairs evaluated by an Ability, rather than scattered
 * `if (role === ...)` checks. Deny-by-default.
 *
 * Platform roles (SuperAdmin, OperationsAdmin) are the only ones that may cross tenant
 * boundaries — and only through audited endpoints. Tenant roles are scoped to one org.
 */

export type Role =
  | 'SUPER_ADMIN'
  | 'OPERATIONS_ADMIN'
  | 'CLIENT_OWNER'
  | 'SALES_MANAGER'
  | 'SALES_EXECUTIVE'
  | 'PRE_SALES_EXECUTIVE'
  | 'SUPPORT';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type Subject =
  | 'Organization'
  | 'User'
  | 'Lead'
  | 'Contact'
  | 'Conversation'
  | 'Call'
  | 'Campaign'
  | 'Appointment'
  | 'KnowledgeBase'
  | 'AIEmployee'
  | 'Analytics'
  | 'AuditLog'
  | 'all';

export const PLATFORM_ROLES: readonly Role[] = ['SUPER_ADMIN', 'OPERATIONS_ADMIN'];

export interface Permission {
  readonly action: Action;
  readonly subject: Subject;
}

/** `manage` implies all actions; `all` implies all subjects. */
const matches = (granted: Permission, action: Action, subject: Subject): boolean =>
  (granted.action === 'manage' || granted.action === action) &&
  (granted.subject === 'all' || granted.subject === subject);

/**
 * Role → permissions. The single source of truth for "what each role can do". Refinements
 * that depend on resource attributes (e.g. "a Sales Executive may only UPDATE leads assigned
 * to them") are enforced at the use-case layer on top of these coarse grants.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [{ action: 'manage', subject: 'all' }],
  OPERATIONS_ADMIN: [
    { action: 'manage', subject: 'Organization' },
    { action: 'manage', subject: 'User' },
    { action: 'read', subject: 'all' },
  ],
  CLIENT_OWNER: [
    { action: 'manage', subject: 'Organization' },
    { action: 'manage', subject: 'User' },
    { action: 'manage', subject: 'Lead' },
    { action: 'manage', subject: 'Contact' },
    { action: 'manage', subject: 'Campaign' },
    { action: 'manage', subject: 'Appointment' },
    { action: 'manage', subject: 'KnowledgeBase' },
    { action: 'manage', subject: 'AIEmployee' },
    { action: 'read', subject: 'Analytics' },
    { action: 'read', subject: 'Call' },
    { action: 'read', subject: 'Conversation' },
  ],
  SALES_MANAGER: [
    { action: 'manage', subject: 'Lead' },
    { action: 'manage', subject: 'Contact' },
    { action: 'manage', subject: 'Appointment' },
    { action: 'manage', subject: 'Campaign' },
    { action: 'read', subject: 'Analytics' },
    { action: 'read', subject: 'Call' },
    { action: 'read', subject: 'Conversation' },
    { action: 'read', subject: 'KnowledgeBase' },
  ],
  SALES_EXECUTIVE: [
    { action: 'read', subject: 'Lead' },
    { action: 'update', subject: 'Lead' },
    { action: 'read', subject: 'Contact' },
    { action: 'update', subject: 'Contact' },
    { action: 'manage', subject: 'Appointment' },
    { action: 'read', subject: 'Conversation' },
    { action: 'read', subject: 'Call' },
    { action: 'read', subject: 'KnowledgeBase' },
  ],
  PRE_SALES_EXECUTIVE: [
    { action: 'read', subject: 'Lead' },
    { action: 'update', subject: 'Lead' },
    { action: 'read', subject: 'Contact' },
    { action: 'create', subject: 'Appointment' },
    { action: 'read', subject: 'Conversation' },
    { action: 'read', subject: 'KnowledgeBase' },
  ],
  SUPPORT: [
    { action: 'read', subject: 'Conversation' },
    { action: 'read', subject: 'Contact' },
    { action: 'read', subject: 'Lead' },
  ],
};

/** Immutable capability object resolved from a user's roles. */
export class Ability {
  private constructor(private readonly permissions: Permission[]) {}

  static forRoles(roles: Role[]): Ability {
    const perms = roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []);
    return new Ability(perms);
  }

  can(action: Action, subject: Subject): boolean {
    return this.permissions.some((p) => matches(p, action, subject));
  }

  cannot(action: Action, subject: Subject): boolean {
    return !this.can(action, subject);
  }
}

export const isPlatformRole = (role: Role): boolean => PLATFORM_ROLES.includes(role);
