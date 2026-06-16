// String-branded id schema helpers. IDs are opaque strings (ULID/cuid) carried across
// the wire; branding keeps a LeadId from being assigned where a ContactId is expected,
// mirroring the domain-kernel `Branded<T, B>` approach but at the contract/zod layer.

import { z } from 'zod';

/**
 * Build a branded, non-empty-string id schema for a given brand name, e.g.
 * `const LeadId = brandedId('LeadId');  type LeadId = z.infer<typeof LeadId>;`
 * Uses zod's native `.brand()` so a `LeadId` can never be assigned where a
 * `ContactId` is expected, mirroring the domain-kernel `Branded<T, B>` approach.
 */
export function brandedId<B extends string>(brand: B) {
  return z.string().min(1, `${brand} must be a non-empty string`).brand<B>();
}

export const OrganizationId = brandedId('OrganizationId');
export type OrganizationId = z.infer<typeof OrganizationId>;

export const UserId = brandedId('UserId');
export type UserId = z.infer<typeof UserId>;

export const LeadId = brandedId('LeadId');
export type LeadId = z.infer<typeof LeadId>;

export const ContactId = brandedId('ContactId');
export type ContactId = z.infer<typeof ContactId>;

export const ConversationId = brandedId('ConversationId');
export type ConversationId = z.infer<typeof ConversationId>;

export const MessageId = brandedId('MessageId');
export type MessageId = z.infer<typeof MessageId>;
