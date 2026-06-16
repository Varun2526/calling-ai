// RFC 9457 Problem Details for HTTP APIs. The standard error body for every non-2xx
// response. `type` is a URI reference identifying the problem class; extension members
// (e.g. `errors`, `traceId`) are permitted alongside the standard fields.

import { z } from 'zod';

export const problemDetailsSchema = z
  .object({
    /** URI reference identifying the problem type. Defaults to "about:blank". */
    type: z.string().default('about:blank'),
    /** Short, human-readable summary of the problem type. */
    title: z.string(),
    /** The HTTP status code generated for this occurrence. */
    status: z.number().int().min(100).max(599),
    /** Human-readable explanation specific to this occurrence. */
    detail: z.string().optional(),
    /** URI reference identifying the specific occurrence. */
    instance: z.string().optional(),
  })
  // Extension members (traceId, field-level errors, etc.) are allowed per RFC 9457 §3.2.
  .catchall(z.unknown());

export type ProblemDetails = z.infer<typeof problemDetailsSchema>;
