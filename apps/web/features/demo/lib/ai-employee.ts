import type { Intent, LeadProfile } from './types';

/**
 * MOCK AI pre-sales employee (rule-based). Stands in for the real OpenAI-backed reasoning
 * orchestrator so the product flow can be demoed with no API key. It (1) extracts
 * qualification fields from free text — including the PRD's regional-language intent cues —
 * and (2) decides the next conversational move (ask the next missing question, or propose a
 * site visit once enough is known). Deterministic and offline by design.
 */

const CITIES = [
  'hyderabad',
  'gachibowli',
  'kondapur',
  'kokapet',
  'financial district',
  'madhapur',
  'bangalore',
  'bengaluru',
  'whitefield',
  'pune',
  'mumbai',
  'chennai',
  'noida',
  'gurgaon',
];

const PROPERTY_TYPES: Array<[RegExp, string]> = [
  [/\b([1-4])\s*bhk\b/i, '$1 BHK'],
  [/\bvilla\b/i, 'Villa'],
  [/\bplot|land\b/i, 'Plot'],
  [/\bapartment|flat\b/i, 'Apartment'],
  [/\bpenthouse\b/i, 'Penthouse'],
];

/** Parse Indian-format budgets: "1.2 cr", "80 lakh", "₹75L", "50 lakhs", "1 crore". */
function parseBudget(text: string): { label: string; value: number } | undefined {
  const m = text
    .toLowerCase()
    .match(/(?:₹|rs\.?|inr)?\s*([\d]+(?:\.\d+)?)\s*(cr|crore|crores|l|lakh|lakhs|k)?/i);
  if (!m || !m[1]) return undefined;
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (!unit) return undefined; // bare number without a unit is too ambiguous
  let value: number;
  let label: string;
  if (unit.startsWith('cr')) {
    value = n * 10_000_000;
    label = `₹${n} Cr`;
  } else if (unit.startsWith('l')) {
    value = n * 100_000;
    label = `₹${n} L`;
  } else {
    value = n * 1_000;
    label = `₹${n}K`;
  }
  return { label, value };
}

function detectIntent(text: string): Intent | undefined {
  const t = text.toLowerCase();
  // Regional-language cues from the PRD (Telugu/Hindi mixed with English).
  if (/rental|yield|roi|return|invest|investment|rent karna|kiraya/.test(t)) return 'investor';
  if (/school|family|kids|children|daggara|paas|self use|live|stay|own use/.test(t))
    return 'self-use';
  if (/loan|emi|finance|financing|home loan|process|mortgage/.test(t)) return 'financing';
  return undefined;
}

function detectLanguage(text: string): string | undefined {
  const t = text.toLowerCase();
  // Romanized regional markers (the PRD's "code-switching" examples).
  if (/undali|untundi|ela|daggara|kavali|cheppandi/.test(t)) return 'Telugu + English';
  if (/chahiye|kitna|kaisa|karna|hoga|batao/.test(t)) return 'Hindi + English';
  return undefined;
}

export interface ExtractionResult {
  profile: LeadProfile;
  changed: string[]; // human labels of newly captured fields (for the activity feed)
}

/** Merge any fields found in `text` into the running profile. */
export function extractFields(text: string, prev: LeadProfile): ExtractionResult {
  const profile: LeadProfile = { ...prev };
  const changed: string[] = [];

  for (const [re, label] of PROPERTY_TYPES) {
    const m = text.match(re);
    if (m && !profile.propertyType) {
      profile.propertyType = label.replace('$1', m[1] ?? '').trim();
      changed.push(`Property type → ${profile.propertyType}`);
      break;
    }
  }

  if (!profile.budgetValue) {
    const b = parseBudget(text);
    if (b) {
      profile.budgetLabel = b.label;
      profile.budgetValue = b.value;
      changed.push(`Budget → ${b.label}`);
    }
  }

  if (!profile.location) {
    const hit = CITIES.find((c) => text.toLowerCase().includes(c));
    if (hit) {
      profile.location = hit.replace(/\b\w/g, (m) => m.toUpperCase());
      changed.push(`Location → ${profile.location}`);
    }
  }

  if (!profile.timeline) {
    const tm = text
      .toLowerCase()
      .match(
        /(immediately|asap|this month|next month|\d+\s*month|this year|next year|ready to move)/,
      );
    if (tm) {
      profile.timeline = tm[0];
      changed.push(`Timeline → ${profile.timeline}`);
    }
  }

  const intent = detectIntent(text);
  if (intent && profile.intent === 'unknown') {
    profile.intent = intent;
    changed.push(`Intent → ${intent}`);
  }

  // Loan need is detected independently of buying intent — an investor can also need finance.
  if (profile.loanRequired === undefined) {
    if (/\b(loan|emi|home loan|mortgage|finance|financing)\b/i.test(text)) {
      profile.loanRequired = true;
      changed.push('Loan required → yes');
    } else if (/self[- ]?funded|cash|no loan|own funds/i.test(text)) {
      profile.loanRequired = false;
      changed.push('Loan required → no');
    }
  }

  const lang = detectLanguage(text);
  if (lang && profile.language !== lang) {
    profile.language = lang;
    changed.push(`Language → ${lang}`);
  }

  if (/site visit|visit|see the|come|when can|show me|appointment/i.test(text)) {
    if (!profile.siteVisitInterest) {
      profile.siteVisitInterest = true;
      changed.push('Site-visit interest → yes');
    }
  }

  return { profile, changed };
}

/** Decide the AI's next message given what's still unknown. */
export function nextReply(p: LeadProfile): { text: string; proposeVisit: boolean } {
  if (!p.propertyType)
    return {
      text: 'Great to connect! I can help you find the right home. What kind of property are you looking for — say a 2/3 BHK apartment, a villa, or a plot?',
      proposeVisit: false,
    };
  if (!p.budgetValue)
    return {
      text: `Perfect, a ${p.propertyType} it is. What budget range are you working with? (for example, ₹80 lakh or ₹1.2 Cr)`,
      proposeVisit: false,
    };
  if (!p.location)
    return {
      text: `Noted — around ${p.budgetLabel}. Which area or city are you considering?`,
      proposeVisit: false,
    };
  if (p.intent === 'unknown')
    return {
      text: `${p.location} is a great choice. Quick one — is this for your own use/family, or more of an investment?`,
      proposeVisit: false,
    };
  if (!p.timeline)
    return {
      text: 'Got it. And how soon are you planning to buy — immediately, in a few months, or just exploring?',
      proposeVisit: false,
    };
  if (p.loanRequired === undefined)
    return {
      text: 'Understood. Will you need assistance with a home loan, or is it a self-funded purchase?',
      proposeVisit: false,
    };

  // Enough captured → move to action: propose a site visit.
  return {
    text: `Thanks${p.name ? ', ' + p.name : ''}! Based on what you've shared — a ${p.propertyType} around ${p.budgetLabel} in ${p.location} — I have a couple of great options. Would you like to schedule a site visit this weekend? I can have our team confirm a slot.`,
    proposeVisit: true,
  };
}

export const GREETING =
  "Hi! 👋 This is Aarav from Propulse Realty on WhatsApp. Thanks for your interest! May I ask what kind of property you're looking for?";
