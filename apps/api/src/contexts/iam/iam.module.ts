import { Module } from '@nestjs/common';
import { OrganizationController } from './presentation/organization.controller.js';
import { GetCurrentOrganizationQuery } from './application/get-current-organization.query.js';
import { ORGANIZATION_REPOSITORY } from './domain/organization.repository.js';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository.js';

/**
 * IAM context — composition root for the module. The ONLY file that wires infrastructure to
 * ports. Demonstrates the canonical layered layout (domain/application/infrastructure/
 * presentation) every context follows (REPOSITORY_STRUCTURE §3).
 */
@Module({
  controllers: [OrganizationController],
  providers: [
    GetCurrentOrganizationQuery,
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
  ],
})
export class IamModule {}
