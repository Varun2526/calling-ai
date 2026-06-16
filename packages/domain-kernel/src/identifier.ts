/**
 * Branded ID primitives. IDs are opaque strings (UUID/cuid) but branded at the type
 * level so a LeadId can never be passed where a ContactId is expected, and entities
 * reference each other by typed ID only (never by object) — see DOMAIN_RULES.md.
 */
declare const brand: unique symbol;
export type Branded<T, B extends string> = T & { readonly [brand]: B };

export type Uuid = string;

export const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;
