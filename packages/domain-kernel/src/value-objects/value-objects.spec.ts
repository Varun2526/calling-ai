import { describe, it, expect } from 'vitest';
import { Money } from './money.js';
import { E164Phone } from './phone.js';
import { Email } from './email.js';
import { isOk, isErr } from '../result.js';

describe('Money', () => {
  it('rejects floats and negatives, stores minor units', () => {
    expect(isErr(Money.create(1.5))).toBe(true);
    expect(isErr(Money.create(-100))).toBe(true);
    const m = Money.create(10_000_000_00); // ₹1 crore in paise
    expect(isOk(m)).toBe(true);
    if (isOk(m)) expect(m.value.majorUnits).toBe(10_000_000);
  });

  it('refuses cross-currency addition', () => {
    const inr = Money.create(100, 'INR');
    const usd = Money.create(100, 'USD');
    if (isOk(inr) && isOk(usd)) expect(isErr(inr.value.add(usd.value))).toBe(true);
  });
});

describe('E164Phone', () => {
  it('normalizes and validates', () => {
    const r = E164Phone.create('+91 98765-43210');
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value.value).toBe('+919876543210');
    expect(isErr(E164Phone.create('98765'))).toBe(true);
  });
});

describe('Email', () => {
  it('lowercases and validates', () => {
    const r = Email.create('  Buyer@Example.COM ');
    if (isOk(r)) expect(r.value.value).toBe('buyer@example.com');
    expect(isErr(Email.create('nope'))).toBe(true);
  });
});
