import { describe, it, expect } from 'vitest';
import { Ability, isPlatformRole } from './authorization.js';

describe('Ability (RBAC)', () => {
  it('SuperAdmin can do anything (manage all)', () => {
    const a = Ability.forRoles(['SUPER_ADMIN']);
    expect(a.can('delete', 'Organization')).toBe(true);
    expect(a.can('manage', 'AuditLog')).toBe(true);
  });

  it('OperationsAdmin can read everything but only manage orgs/users', () => {
    const a = Ability.forRoles(['OPERATIONS_ADMIN']);
    expect(a.can('read', 'Analytics')).toBe(true);
    expect(a.can('manage', 'User')).toBe(true);
    expect(a.cannot('delete', 'Lead')).toBe(true);
  });

  it('SalesExecutive can read+update leads but not manage the organization', () => {
    const a = Ability.forRoles(['SALES_EXECUTIVE']);
    expect(a.can('read', 'Lead')).toBe(true);
    expect(a.can('update', 'Lead')).toBe(true);
    expect(a.cannot('manage', 'Organization')).toBe(true);
    expect(a.cannot('delete', 'Lead')).toBe(true);
  });

  it('Support is read-mostly and cannot touch the knowledge base', () => {
    const a = Ability.forRoles(['SUPPORT']);
    expect(a.can('read', 'Conversation')).toBe(true);
    expect(a.cannot('update', 'Lead')).toBe(true);
    expect(a.cannot('read', 'KnowledgeBase')).toBe(true);
  });

  it('denies by default for an unknown/empty role set', () => {
    const a = Ability.forRoles([]);
    expect(a.cannot('read', 'Lead')).toBe(true);
  });

  it('combines permissions across multiple roles', () => {
    const a = Ability.forRoles(['SUPPORT', 'SALES_EXECUTIVE']);
    expect(a.can('update', 'Lead')).toBe(true); // from SALES_EXECUTIVE
    expect(a.can('read', 'Conversation')).toBe(true); // from SUPPORT
  });

  it('identifies platform roles (tenant-crossing)', () => {
    expect(isPlatformRole('SUPER_ADMIN')).toBe(true);
    expect(isPlatformRole('OPERATIONS_ADMIN')).toBe(true);
    expect(isPlatformRole('CLIENT_OWNER')).toBe(false);
  });
});
