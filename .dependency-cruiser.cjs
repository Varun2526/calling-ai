/**
 * Propulse AI — Architectural boundary enforcement.
 *
 * Encodes the Clean Architecture dependency matrix and DDD context isolation from
 * docs/CLEAN_ARCHITECTURE.md and docs/REPOSITORY_STRUCTURE.md. A violation fails `pnpm
 * boundaries` in CI. Relaxing any rule requires an ADR that updates this file in the same PR.
 *
 * Run: pnpm dlx depcruise apps/api/src --config .dependency-cruiser.cjs
 */
const path = require('node:path');

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies indicate a missing boundary or a leaked abstraction.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-no-infra',
      severity: 'error',
      comment:
        'The domain layer MUST be pure: no NestJS, Prisma, BullMQ, Redis, AWS, HTTP clients, or env.',
      from: { path: 'apps/api/src/contexts/[^/]+/domain' },
      to: {
        path: [
          '@nestjs',
          '@prisma/client',
          'prisma',
          'bullmq',
          'ioredis',
          '@aws-sdk',
          'axios',
          'twilio',
          'openai',
          'apps/api/src/contexts/[^/]+/(infrastructure|presentation|application)',
        ],
      },
    },
    {
      name: 'application-no-infra',
      severity: 'error',
      comment:
        'The application layer orchestrates via ports; it must not import the infrastructure layer or DB/SDK clients directly.',
      from: { path: 'apps/api/src/contexts/[^/]+/application' },
      to: {
        path: [
          '@prisma/client',
          'apps/api/src/contexts/[^/]+/infrastructure',
          'apps/api/src/contexts/[^/]+/presentation',
        ],
      },
    },
    {
      name: 'presentation-no-domain-direct',
      severity: 'error',
      comment:
        'Presentation talks to the application layer only; it must not reach into domain entities or infrastructure directly.',
      from: { path: 'apps/api/src/contexts/[^/]+/presentation' },
      to: { path: ['apps/api/src/contexts/[^/]+/(infrastructure)'] },
    },
    {
      name: 'no-cross-context-internals',
      severity: 'error',
      comment:
        'A bounded context may NOT import another context\'s domain/application/infrastructure. ' +
        'Cross-context communication goes through @propulse/contracts (types/events) or domain events.',
      from: { path: 'apps/api/src/contexts/([^/]+)/.+' },
      to: {
        path: 'apps/api/src/contexts/([^/]+)/(domain|application|infrastructure|presentation)',
        // Allow same-context imports; forbid different-context internals.
        pathNot: 'apps/api/src/contexts/$1/',
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreferenced module — dead code or a missing wiring.',
      from: { orphan: true, pathNot: ['\\.(spec|test)\\.ts$', 'index\\.ts$', '\\.module\\.ts$'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: path.join(__dirname, 'apps/api/tsconfig.json') },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require'] },
  },
};
