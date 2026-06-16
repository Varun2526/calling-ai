import { type Result, ok, err, ValidationError } from '../result.js';

export type Currency = 'INR' | 'USD' | 'AED';

/**
 * Money — amount stored as an integer in MINOR units (paise/cents) to avoid floating
 * point errors. Default currency INR. Never represent money as a float anywhere.
 */
export class Money {
  private constructor(
    public readonly minorUnits: number,
    public readonly currency: Currency,
  ) {}

  static create(minorUnits: number, currency: Currency = 'INR'): Result<Money> {
    if (!Number.isInteger(minorUnits)) {
      return err(new ValidationError('Money.minorUnits must be an integer (minor units)'));
    }
    if (minorUnits < 0) {
      return err(new ValidationError('Money.minorUnits must be non-negative'));
    }
    return ok(new Money(minorUnits, currency));
  }

  add(other: Money): Result<Money> {
    if (other.currency !== this.currency) {
      return err(new ValidationError('Cannot add Money of different currencies'));
    }
    return Money.create(this.minorUnits + other.minorUnits, this.currency);
  }

  get majorUnits(): number {
    return this.minorUnits / 100;
  }

  equals(other: Money): boolean {
    return this.minorUnits === other.minorUnits && this.currency === other.currency;
  }
}
