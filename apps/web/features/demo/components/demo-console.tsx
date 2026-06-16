'use client';

import { useMemo, useRef, useState } from 'react';
import type { ChatMessage, Lead, LeadProfile } from '../lib/types';
import { extractFields, nextReply, GREETING } from '../lib/ai-employee';
import { scoreLead, type ScoreFactor } from '../lib/scoring';

const NOW = () => {
  // Avoid SSR/CSR clock mismatch: timestamps are assigned on the client only.
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const initialProfile: LeadProfile = {
  intent: 'unknown',
  language: 'English',
  siteVisitInterest: false,
};

const initialLead: Lead = {
  contactName: 'WhatsApp Buyer',
  phone: '+91 98••• ••210',
  source: 'WhatsApp',
  stage: 'New',
  score: 0,
  category: 'Cold',
  profile: initialProfile,
};

interface Activity {
  id: number;
  text: string;
  at: string;
}

const PRESETS = [
  {
    label: '🏡 Family buyer (Telugu)',
    text: '3 BHK kavali, schools daggara undali, Gachibowli lo',
  },
  {
    label: '📈 Investor',
    text: 'Looking for an apartment in Kondapur, rental yield ela untundi? budget 1.2 cr',
  },
  {
    label: '🏦 Loan seeker',
    text: 'Need a 2BHK in Hyderabad around 80 lakh, loan process ela untundi?',
  },
];

let msgSeq = 0;
const mkMsg = (sender: ChatMessage['sender'], text: string): ChatMessage => ({
  id: `m${++msgSeq}`,
  sender,
  text,
  at: NOW(),
});

export function DemoConsole() {
  const [messages, setMessages] = useState<ChatMessage[]>([mkMsg('ai', GREETING)]);
  const [lead, setLead] = useState<Lead>(initialLead);
  const [factors, setFactors] = useState<ScoreFactor[]>([]);
  const [activity, setActivity] = useState<Activity[]>([
    { id: 0, text: 'Inbound WhatsApp conversation started', at: NOW() },
  ]);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState(0);
  const actSeq = useRef(1);
  const chatEnd = useRef<HTMLDivElement>(null);

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    setInput('');

    const buyerMsg = mkMsg('buyer', text);
    const newTurns = turns + 1;

    // 1) Extract qualification fields (the AI "understanding" the buyer).
    const { profile, changed } = extractFields(text, lead.profile);

    // 2) Re-score the lead.
    const { score, category, factors: f } = scoreLead(profile, newTurns);

    // 3) Decide the AI's next move.
    const { text: replyText, proposeVisit } = nextReply(profile);

    // 4) Pipeline stage progression.
    const hasCore = profile.propertyType && profile.budgetValue && profile.location;
    const stage: Lead['stage'] = proposeVisit
      ? 'Qualified'
      : hasCore
        ? 'Qualifying'
        : newTurns > 0
          ? 'Qualifying'
          : 'New';

    const updatedLead: Lead = {
      ...lead,
      profile,
      score,
      category,
      stage: profile.siteVisitInterest ? 'Visit Scheduled' : stage,
      assignedTo:
        category === 'Hot' && !lead.assignedTo ? 'Priya (Sr. Sales Exec)' : lead.assignedTo,
    };

    const newActivities: Activity[] = changed.map((c) => ({
      id: actSeq.current++,
      text: c,
      at: NOW(),
    }));
    if (category === 'Hot' && lead.category !== 'Hot') {
      newActivities.push({
        id: actSeq.current++,
        text: '🔥 Lead became HOT — auto-assigned to Priya',
        at: NOW(),
      });
    }
    if (profile.siteVisitInterest && !lead.profile.siteVisitInterest) {
      newActivities.push({
        id: actSeq.current++,
        text: '📅 Site visit interest captured',
        at: NOW(),
      });
    }

    setMessages((m) => [...m, buyerMsg, mkMsg('ai', replyText)]);
    setLead(updatedLead);
    setFactors(f);
    setTurns(newTurns);
    if (newActivities.length) setActivity((a) => [...newActivities.reverse(), ...a]);

    requestAnimationFrame(() => chatEnd.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  const reset = () => {
    msgSeq = 0;
    setMessages([mkMsg('ai', GREETING)]);
    setLead(initialLead);
    setFactors([]);
    setTurns(0);
    actSeq.current = 1;
    setActivity([{ id: 0, text: 'Inbound WhatsApp conversation started', at: NOW() }]);
  };

  const catColor = useMemo(
    () => ({ Hot: 'bg-red-500', Warm: 'bg-amber-500', Cold: 'bg-slate-400' })[lead.category],
    [lead.category],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ───────── Buyer side: WhatsApp-style chat ───────── */}
      <section className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center gap-3 bg-emerald-600 px-4 py-3 text-white">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-lg">
            🏠
          </div>
          <div className="leading-tight">
            <div className="font-semibold">Propulse Realty</div>
            <div className="text-xs text-emerald-100">
              AI pre-sales · typically replies instantly
            </div>
          </div>
          <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[11px]">WhatsApp</span>
        </header>

        <div className="flex-1 space-y-2 overflow-y-auto bg-[#efeae2] p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.sender === 'buyer' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                  m.sender === 'buyer' ? 'bg-[#d9fdd3] text-slate-800' : 'bg-white text-slate-800'
                }`}
              >
                {m.text}
                <div className="mt-0.5 text-right text-[10px] text-slate-400">{m.at}</div>
              </div>
            </div>
          ))}
          <div ref={chatEnd} />
        </div>

        <div className="border-t border-slate-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => send(p.text)}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
              >
                {p.label}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type as the buyer… e.g. “3 BHK in Gachibowli, budget 1.5 cr”"
              className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Send
            </button>
          </form>
        </div>
      </section>

      {/* ───────── Team side: live CRM dashboard ───────── */}
      <section className="flex h-[640px] flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Live CRM · Sales team view
          </h2>
          <button onClick={reset} className="text-xs text-slate-400 underline hover:text-slate-600">
            reset
          </button>
        </div>

        {/* Lead card */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-semibold text-slate-800">{lead.contactName}</div>
              <div className="text-xs text-slate-400">
                {lead.phone} · via {lead.source}
              </div>
            </div>
            <div className="text-right">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full ${catColor} px-3 py-1 text-sm font-semibold text-white`}
              >
                {lead.category} · {lead.score}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">lead score</div>
            </div>
          </div>

          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${catColor} transition-all duration-500`}
              style={{ width: `${lead.score}%` }}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <Stage current={lead.stage} />
          </div>
          {lead.assignedTo && (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              👤 Assigned to <b>{lead.assignedTo}</b>
            </div>
          )}
        </div>

        {/* Captured profile */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Captured requirements
          </div>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Field k="Property" v={lead.profile.propertyType} />
            <Field k="Budget" v={lead.profile.budgetLabel} />
            <Field k="Location" v={lead.profile.location} />
            <Field k="Timeline" v={lead.profile.timeline} />
            <Field
              k="Intent"
              v={lead.profile.intent === 'unknown' ? undefined : lead.profile.intent}
            />
            <Field
              k="Loan"
              v={
                lead.profile.loanRequired === undefined
                  ? undefined
                  : lead.profile.loanRequired
                    ? 'Required'
                    : 'No'
              }
            />
            <Field k="Language" v={lead.profile.language} />
            <Field k="Site visit" v={lead.profile.siteVisitInterest ? 'Interested' : undefined} />
          </dl>
        </div>

        {/* Score breakdown */}
        {factors.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Why this score (explainable)
            </div>
            <ul className="space-y-1 text-xs">
              {factors.map((f) => (
                <li key={f.label} className="flex justify-between text-slate-600">
                  <span>{f.label}</span>
                  <span className="font-medium text-emerald-600">+{f.points}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Activity timeline */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Activity (auto-logged by the AI)
          </div>
          <ul className="space-y-1.5 text-xs">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-2 text-slate-600">
                <span className="text-slate-300">{a.at}</span>
                <span>{a.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Field({ k, v }: { k: string; v?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{k}</dt>
      <dd className={v ? 'font-medium text-slate-800' : 'text-slate-300'}>{v ?? '—'}</dd>
    </div>
  );
}

function Stage({ current }: { current: Lead['stage'] }) {
  const stages: Lead['stage'][] = ['New', 'Qualifying', 'Qualified', 'Visit Scheduled'];
  const idx = stages.indexOf(current);
  return (
    <>
      {stages.map((s, i) => (
        <span
          key={s}
          className={`rounded-full px-2.5 py-1 ${
            i <= idx ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
          }`}
        >
          {s}
        </span>
      ))}
    </>
  );
}
