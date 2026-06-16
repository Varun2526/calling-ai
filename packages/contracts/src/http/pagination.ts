// Cursor-based pagination contracts (API_CONTRACTS). Requests carry an opaque cursor and
// a bounded limit; responses echo back the items plus the next cursor (null when done).

import { z } from 'zod';

export const paginationRequestSchema = z.object({
  /** Opaque forward cursor returned by a previous page; omitted for the first page. */
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationRequest = z.infer<typeof paginationRequestSchema>;

/** Build a typed paginated-response schema for a given item schema. */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    /** Cursor for the next page, or null when there are no further results. */
    nextCursor: z.string().min(1).nullable(),
    hasMore: z.boolean(),
  });
}

export type PaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
