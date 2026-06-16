// Re-export the shared NestJS ESLint config. All lint rules (incl. boundary/import
// rules, Phase 4) live in @propulse/eslint-config so every backend app stays consistent.
export { default } from '@propulse/eslint-config/nest';
