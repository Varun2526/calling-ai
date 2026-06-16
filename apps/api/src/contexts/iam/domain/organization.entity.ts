import { AggregateRoot } from '@propulse/domain-kernel';

export type OrganizationStatus = 'ACTIVE' | 'SUSPENDED';

/**
 * Organization aggregate (IAM view) — the tenant root. PURE domain: no framework, no Prisma.
 * Holds only identity/lifecycle here; business profile/config lives in the Organization
 * context (BC-9). See DOMAIN_RULES.md BC-1.
 */
export class Organization extends AggregateRoot<string> {
  private constructor(
    id: string,
    public readonly name: string,
    public status: OrganizationStatus,
  ) {
    super(id);
  }

  static rehydrate(props: { id: string; name: string; status: OrganizationStatus }): Organization {
    return new Organization(props.id, props.name, props.status);
  }

  suspend(): void {
    // Invariant: lifecycle transitions are explicit and auditable.
    this.status = 'SUSPENDED';
  }
}
