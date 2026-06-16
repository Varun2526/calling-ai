import { type Result, ok, err, ValidationError } from '../result.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Email — a validated, lower-cased email address value object. */
export class Email {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<Email> {
    const normalized = raw.trim().toLowerCase();
    if (!EMAIL.test(normalized)) {
      return err(new ValidationError(`Invalid email address: ${raw}`));
    }
    return ok(new Email(normalized));
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
