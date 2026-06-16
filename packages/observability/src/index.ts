// Propulse AI — Observability
// Shared logging + telemetry helpers. Thin wrapper over pino with redaction of sensitive
// fields and a per-request context binder (correlationId/organizationId). Sentry is a
// documented stub so apps can wire it later without pulling @sentry into every install.

import { pino, type Logger, type LoggerOptions } from 'pino';

export type { Logger };

/** Context attached to every log line within a request/workflow scope. */
export interface LogContext {
  correlationId?: string;
  organizationId?: string;
  [key: string]: unknown;
}

/**
 * Paths redacted from every log record. Covers headers/bodies that commonly carry secrets
 * plus the wildcard `*.apiKey` for any provider-config object, and `phone` (PII).
 */
export const REDACT_PATHS = [
  'authorization',
  '*.authorization',
  'headers.authorization',
  'password',
  '*.password',
  'token',
  '*.token',
  '*.apiKey',
  'phone',
  '*.phone',
] as const;

/**
 * Create a named pino logger with sensitive-field redaction applied. `LOG_LEVEL` is read
 * from the environment here purely as a logging knob (not app config); defaults to `info`.
 */
export function createLogger(name: string, options: LoggerOptions = {}): Logger {
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: [...REDACT_PATHS],
      censor: '[REDACTED]',
    },
    ...options,
  });
}

/**
 * Derive a child logger that stamps `correlationId`/`organizationId` (and any extra
 * context) onto every line — the standard way to scope logs to a request or workflow.
 */
export function withContext(logger: Logger, context: LogContext): Logger {
  return logger.child(context);
}

/**
 * Initialize Sentry error reporting. STUB — intentionally a no-op so we don't add an
 * @sentry/* dependency to every consumer's install. An app that needs Sentry should
 * install the SDK itself and replace this call.
 *
 * TODO(observability): wire `@sentry/node` here, init with `{ dsn, environment, tracesSampleRate }`,
 *   and add a pino transport / breadcrumb bridge. See SENTRY_DSN in .env.example.
 */
export function initSentry(dsn?: string): void {
  if (!dsn) return;
  // No-op placeholder. Real implementation deferred to avoid a hard @sentry dependency.
}
