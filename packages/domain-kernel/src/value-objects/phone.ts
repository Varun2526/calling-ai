import { type Result, ok, err, ValidationError } from '../result.js';

const E164 = /^\+[1-9]\d{6,14}$/;

/**
 * E164Phone — a phone number in E.164 format (e.g. +919876543210). The canonical
 * identifier used by customer identity resolution across channels (DOMAIN_RULES).
 */
export class E164Phone {
  private constructor(public readonly value: string) {}

  static create(raw: string): Result<E164Phone> {
    const normalized = raw.replace(/[\s\-()]/g, '');
    if (!E164.test(normalized)) {
      return err(new ValidationError(`Invalid E.164 phone number: ${raw}`));
    }
    return ok(new E164Phone(normalized));
  }

  equals(other: E164Phone): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
