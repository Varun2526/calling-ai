import type { LeadProfile, ScoreCategory } from './types';

/**
 * Lead scoring — explainable, deterministic (mirrors the real Lead Qualification context's
 * ScoringEngine, PRD "Lead Scoring"). Each captured signal contributes points; the total
 * maps to Cold / Warm / Hot. In production this lives in the qualification domain and is
 * driven by configurable org weights.
 */
export interface ScoreFactor {
  label: string;
  points: number;
}

export function scoreLead(
  p: LeadProfile,
  engagementTurns: number,
): {
  score: number;
  category: ScoreCategory;
  factors: ScoreFactor[];
} {
  const factors: ScoreFactor[] = [];

  if (p.budgetValue) {
    // Higher budget → stronger buyer intent signal (cap contribution at 25).
    const pts = Math.min(25, Math.round((p.budgetValue / 10_000_000) * 12) + 8);
    factors.push({ label: 'Budget disclosed', points: pts });
  }
  if (p.propertyType) factors.push({ label: 'Property type known', points: 12 });
  if (p.location) factors.push({ label: 'Location known', points: 10 });
  if (p.timeline) {
    const soon = /immediate|month|asap|ready|this year/i.test(p.timeline);
    factors.push({ label: soon ? 'Buying soon' : 'Timeline known', points: soon ? 20 : 8 });
  }
  if (p.intent !== 'unknown') factors.push({ label: `Intent: ${p.intent}`, points: 10 });
  if (p.loanRequired !== undefined) factors.push({ label: 'Financing clarified', points: 5 });
  if (p.siteVisitInterest) factors.push({ label: 'Wants a site visit', points: 18 });

  // Engagement: each meaningful exchange adds a little, capped.
  factors.push({ label: 'Engagement', points: Math.min(10, engagementTurns * 2) });

  const score = Math.min(
    100,
    factors.reduce((s, f) => s + f.points, 0),
  );
  const category: ScoreCategory = score >= 70 ? 'Hot' : score >= 40 ? 'Warm' : 'Cold';
  return { score, category, factors };
}
