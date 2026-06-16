import { type Branded, isNonEmptyString } from '../identifier.js';
import { type Result, ok, err, ValidationError } from '../result.js';

/**
 * OrganizationId — the tenant identifier. Part of the shared kernel because EVERY
 * aggregate, event, cache key, queue job, and row is scoped by it (ARCHITECTURE §10).
 */
export type OrganizationId = Branded<string, 'OrganizationId'>;

export const OrganizationId = {
  create(value: string): Result<OrganizationId> {
    if (!isNonEmptyString(value)) {
      return err(new ValidationError('OrganizationId must be a non-empty string'));
    }
    return ok(value as OrganizationId);
  },
  /** Use only at trust boundaries where the value is already validated (e.g. from auth). */
  unsafe(value: string): OrganizationId {
    return value as OrganizationId;
  },
};
