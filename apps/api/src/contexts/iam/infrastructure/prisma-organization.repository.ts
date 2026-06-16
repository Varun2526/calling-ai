import { Injectable } from '@nestjs/common';
import { Organization } from '../domain/organization.entity.js';
import type { OrganizationRepository } from '../domain/organization.repository.js';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';

/**
 * Infrastructure ADAPTER — implements the domain's OrganizationRepository port using Prisma.
 * This is the ONLY place in the IAM context that knows Prisma exists. Maps the persistence
 * row to the domain aggregate (no domain rules here).
 */
@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Organization | null> {
    const row = await this.prisma.organization.findUnique({ where: { id } });
    if (!row) return null;
    return Organization.rehydrate({
      id: row.id,
      name: row.name,
      status: row.status as 'ACTIVE' | 'SUSPENDED',
    });
  }
}
