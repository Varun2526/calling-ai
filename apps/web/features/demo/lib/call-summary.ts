import type { Lead, LeadProfile } from './types';

/**
 * Post-call AI summary — mirrors the PRD "Calls Module" / "AI Summaries": extract the key
 * facts, a sentiment read, and a recommended next action from the conversation. In
 * production this is an LLM call over the transcript; here it's derived from the captured
 * profile + score so the demo shows the same artifact a real call would produce.
 */
export interface CallSummary {
  sentiment: 'Positive' | 'Neutral' | 'Negative';
  requirements: string;
  recommendedAction: string;
  bullets: string[];
}

export function summarizeCall(lead: Lead, turns: number): CallSummary {
  const p: LeadProfile = lead.profile;
  const parts: string[] = [];
  if (p.propertyType) parts.push(p.propertyType);
  if (p.budgetLabel) parts.push(`budget ${p.budgetLabel}`);
  if (p.location) parts.push(`in ${p.location}`);
  const requirements = parts.length ? parts.join(', ') : 'Requirements not yet captured';

  const sentiment: CallSummary['sentiment'] =
    lead.category === 'Hot'
      ? 'Positive'
      : lead.category === 'Cold' && turns <= 1
        ? 'Neutral'
        : 'Positive';

  let recommendedAction: string;
  if (p.siteVisitInterest)
    recommendedAction = `Confirm the site visit and send location pin for ${p.location ?? 'the project'}.`;
  else if (lead.category === 'Hot') recommendedAction = 'Call back within 1 hour — high intent.';
  else if (lead.category === 'Warm')
    recommendedAction = 'Send brochure + pricing on WhatsApp and follow up in 1 day.';
  else recommendedAction = 'Nurture: re-engage in 3 days with new inventory.';

  const bullets: string[] = [];
  if (p.intent !== 'unknown') bullets.push(`Buyer type: ${p.intent}`);
  if (p.timeline) bullets.push(`Timeline: ${p.timeline}`);
  if (p.loanRequired !== undefined)
    bullets.push(`Home loan: ${p.loanRequired ? 'required' : 'self-funded'}`);
  if (p.language && p.language !== 'English') bullets.push(`Language: ${p.language}`);
  bullets.push(`Lead score: ${lead.score} (${lead.category})`);

  return { sentiment, requirements, recommendedAction, bullets };
}
