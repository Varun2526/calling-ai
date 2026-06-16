// The canonical set of event names. Format: `<context>.<aggregate>.<pastTenseFact>.v<major>`
// (EVENT_CATALOG.md §1). The `.vN` suffix is the integer major; a breaking change becomes
// a NEW name (`.v2`), never a silent repurpose. Consumers must tolerate unknown names.

import { z } from 'zod';

export const EVENT_NAMES = [
  'crm.lead.created.v1',
  'crm.lead.updated.v1',
  'conversation.message.appended.v1',
  'channels.message.received.v1',
  'iam.organization.created.v1',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Schema accepting any of the registered event names. */
export const eventNameSchema = z.enum(EVENT_NAMES);
