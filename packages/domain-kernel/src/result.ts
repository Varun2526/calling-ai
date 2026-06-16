/**
 * Result type for explicit, exception-free domain error handling.
 * Domain/application code returns Result instead of throwing for expected failures
 * (validation, invariant violations). Infrastructure may still throw for truly
 * exceptional conditions (network, DB down).
 */
export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

export const isOk = <T, E>(r: Result<T, E>): r is { ok: true; value: T } => r.ok;
export const isErr = <T, E>(r: Result<T, E>): r is { ok: false; error: E } => !r.ok;

/** Base class for domain errors. Carries a stable machine-readable code. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown/returned when a value object fails its validation invariants. */
export class ValidationError extends DomainError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

/** Returned when a domain invariant would be violated by an operation. */
export class InvariantViolation extends DomainError {
  constructor(message: string) {
    super('INVARIANT_VIOLATION', message);
  }
}
