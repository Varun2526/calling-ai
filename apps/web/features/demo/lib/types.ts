/**
 * PREVIEW DEMO types. This whole feature is a self-contained, in-browser demonstration of
 * the inbound lead-capture + AI-qualification flow (PRD "Primary Inbound Journey") using a
 * MOCK rule-based AI — no backend, no database, no OpenAI key. When real keys + persistence
 * are wired (roadmap Phases 3–5), the mock AI is swapped for the OpenAI-backed reasoning
 * orchestrator and the in-memory lead for the CRM context — the UI stays the same.
 */

export type Sender = 'buyer' | 'ai';

export interface ChatMessage {
  id: string;
  sender: Sender;
  text: string;
  at: string; // HH:MM
}

export type Intent = 'investor' | 'self-use' | 'financing' | 'unknown';
export type ScoreCategory = 'Cold' | 'Warm' | 'Hot';
export type Stage = 'New' | 'Qualifying' | 'Qualified' | 'Visit Scheduled';

/** What the AI has captured about the buyer so far (mirrors the PRD qualification fields). */
export interface LeadProfile {
  name?: string;
  propertyType?: string; // e.g. "3 BHK apartment", "Villa", "Plot"
  budgetLabel?: string; // human label e.g. "₹1.2 Cr"
  budgetValue?: number; // normalized INR for scoring
  location?: string;
  timeline?: string;
  intent: Intent;
  loanRequired?: boolean;
  language: string; // detected, e.g. "English", "Telugu + English"
  siteVisitInterest: boolean;
}

export interface Lead {
  contactName: string;
  phone: string;
  source: 'WhatsApp';
  stage: Stage;
  score: number; // 0..100
  category: ScoreCategory;
  profile: LeadProfile;
  assignedTo?: string;
}
