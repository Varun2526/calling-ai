import { Module } from '@nestjs/common';

/**
 * Crm bounded context (BC) — see docs/DOMAIN_RULES.md.
 * STUB: scaffolded with the canonical layered layout (domain / application /
 * infrastructure / presentation). Implement per docs/FEATURE_BLUEPRINT.md.
 * Boundary rule: this context MUST NOT import another context's internals — cross-context
 * communication goes via @propulse/contracts (types/events) or domain events (CLEAN_ARCHITECTURE).
 */
@Module({})
export class CrmModule {}
