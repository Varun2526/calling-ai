'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Lead, LeadProfile } from '../lib/types';
import { extractFields, nextReply, GREETING } from '../lib/ai-employee';
import { scoreLead } from '../lib/scoring';
import { summarizeCall, type CallSummary } from '../lib/call-summary';
import {
  createRecognizer,
  isMicSupported,
  isSpeechSupported,
  speak,
  stopSpeaking,
  type Recognizer,
} from '../lib/voice';

type CallState = 'idle' | 'live' | 'ended';
type AiState = 'idle' | 'speaking' | 'listening' | 'thinking';

const initialProfile: LeadProfile = {
  intent: 'unknown',
  language: 'English',
  siteVisitInterest: false,
};
const initialLead: Lead = {
  contactName: 'Inbound Caller',
  phone: '+91 98••• ••210',
  source: 'WhatsApp',
  stage: 'New',
  score: 0,
  category: 'Cold',
  profile: initialProfile,
};

const now = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
let seq = 0;
const mkMsg = (sender: ChatMessage['sender'], text: string): ChatMessage => ({
  id: `v${++seq}`,
  sender,
  text,
  at: now(),
});

const AI_VOICE_LANG = 'en-IN';

export function VoiceCall() {
  const [callState, setCallState] = useState<CallState>('idle');
  const [aiState, setAiState] = useState<AiState>('idle');
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);
  const [interim, setInterim] = useState('');
  const [lead, setLead] = useState<Lead>(initialLead);
  const [summary, setSummary] = useState<CallSummary | null>(null);
  const [typed, setTyped] = useState('');
  const [micOn, setMicOn] = useState(false);

  // Refs mirror state for the async speak↔listen loop (avoids stale closures).
  const leadRef = useRef(lead);
  const turnsRef = useRef(0);
  const callRef = useRef<CallState>('idle');
  const recognizerRef = useRef<Recognizer | undefined>(undefined);
  leadRef.current = lead;
  callRef.current = callState;

  // Capability detection depends on `window`, so it must happen AFTER mount — computing it
  // during render causes a server/client hydration mismatch that can freeze the button in
  // its server-rendered (disabled) state. Default to "supported" so SSR and first client
  // paint agree, then correct on mount.
  const [caps, setCaps] = useState({ tts: true, mic: true });
  useEffect(() => {
    setCaps({ tts: isSpeechSupported(), mic: isMicSupported() });
  }, []);
  const micCapable = caps.mic;
  const ttsCapable = caps.tts;

  const listen = useCallback(() => {
    if (!micCapable || callRef.current !== 'live') return;
    setAiState('listening');
    setMicOn(true);
    const rec = createRecognizer({
      lang: AI_VOICE_LANG,
      onInterim: (t) => setInterim(t),
      onFinal: (t) => {
        setInterim('');
        void handleUtterance(t);
      },
      onEnd: () => setMicOn(false),
      onError: () => setMicOn(false),
    });
    recognizerRef.current = rec;
    rec?.start();
  }, [micCapable]);

  const aiSay = useCallback(
    async (text: string) => {
      setAiState('speaking');
      setTranscript((t) => [...t, mkMsg('ai', text)]);
      await speak(text, AI_VOICE_LANG);
      if (callRef.current === 'live' && micCapable) listen();
      else setAiState('idle');
    },
    [listen, micCapable],
  );

  const handleUtterance = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setAiState('thinking');
      setTranscript((t) => [...t, mkMsg('buyer', text)]);

      const turns = (turnsRef.current += 1);
      const { profile } = extractFields(text, leadRef.current.profile);
      const { score, category } = scoreLead(profile, turns);
      const { text: reply, proposeVisit } = nextReply(profile);
      const hasCore = profile.propertyType && profile.budgetValue && profile.location;
      const stage: Lead['stage'] = profile.siteVisitInterest
        ? 'Visit Scheduled'
        : proposeVisit
          ? 'Qualified'
          : hasCore
            ? 'Qualifying'
            : 'Qualifying';
      const updated: Lead = {
        ...leadRef.current,
        profile,
        score,
        category,
        stage,
        assignedTo:
          category === 'Hot' && !leadRef.current.assignedTo
            ? 'Priya (Sr. Sales Exec)'
            : leadRef.current.assignedTo,
      };
      leadRef.current = updated;
      setLead(updated);
      await aiSay(reply);
    },
    [aiSay],
  );

  const startCall = useCallback(() => {
    seq = 0;
    turnsRef.current = 0;
    setTranscript([]);
    setSummary(null);
    setInterim('');
    setLead(initialLead);
    leadRef.current = initialLead;
    setCallState('live');
    callRef.current = 'live';
    void aiSay(GREETING);
  }, [aiSay]);

  const endCall = useCallback(() => {
    callRef.current = 'ended';
    setCallState('ended');
    setAiState('idle');
    setMicOn(false);
    recognizerRef.current?.stop();
    stopSpeaking();
    setSummary(summarizeCall(leadRef.current, turnsRef.current));
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  const catColor = { Hot: 'bg-red-500', Warm: 'bg-amber-500', Cold: 'bg-slate-400' }[lead.category];
  const statusLabel: Record<AiState, string> = {
    idle: 'Idle',
    speaking: '🔊 AI speaking…',
    listening: '🎤 Listening…',
    thinking: '💭 Thinking…',
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ───────── Call panel ───────── */}
      <section className="flex h-[640px] flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 text-slate-100 shadow-sm">
        <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/20 text-xl">
            🎧
          </div>
          <div>
            <div className="font-semibold">Aarav · AI Voice Agent</div>
            <div className="text-xs text-slate-400">Propulse Realty pre-sales</div>
          </div>
          <span
            className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
              callState === 'live'
                ? 'bg-emerald-500/20 text-emerald-300'
                : callState === 'ended'
                  ? 'bg-slate-700 text-slate-300'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {callState === 'live' ? '● On call' : callState === 'ended' ? 'Call ended' : 'Ready'}
          </span>
        </header>

        {/* Pipeline status (mirrors PRD Voice Agent System: STT → Reasoning → TTS) */}
        <div className="flex items-center justify-center gap-2 border-b border-slate-800 py-3 text-xs">
          {(['listening', 'thinking', 'speaking'] as AiState[]).map((s) => (
            <span
              key={s}
              className={`rounded-full px-3 py-1 ${
                aiState === s ? 'bg-emerald-500 text-white' : 'bg-slate-800 text-slate-500'
              }`}
            >
              {s === 'listening' ? 'STT' : s === 'thinking' ? 'AI reasoning' : 'TTS'}
            </span>
          ))}
          <span className="ml-2 text-slate-400">{statusLabel[aiState]}</span>
        </div>

        {/* Live transcript */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {transcript.length === 0 && callState === 'idle' && (
            <div className="mt-10 text-center text-sm text-slate-500">
              Press <b className="text-emerald-400">Start call</b> — the AI will greet you out loud
              and you can talk back.
            </div>
          )}
          {transcript.map((m) => (
            <div key={m.id} className={m.sender === 'ai' ? '' : 'text-right'}>
              <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                {m.sender === 'ai' ? 'AI' : 'Caller'} · {m.at}
              </div>
              <div
                className={`inline-block max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  m.sender === 'ai' ? 'bg-slate-800 text-slate-100' : 'bg-emerald-600 text-white'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {interim && (
            <div className="text-right">
              <div className="inline-block max-w-[85%] rounded-2xl bg-emerald-600/40 px-4 py-2 text-sm italic text-emerald-100">
                {interim}…
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="border-t border-slate-800 p-4">
          {callState !== 'live' ? (
            <button
              onClick={startCall}
              disabled={!ttsCapable}
              className="w-full rounded-full bg-emerald-500 px-4 py-3 font-semibold text-white hover:bg-emerald-400 disabled:opacity-50"
            >
              📞 {callState === 'ended' ? 'Call again' : 'Start call'}
            </button>
          ) : (
            <div className="space-y-2">
              {!micCapable && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = typed;
                    setTyped('');
                    void handleUtterance(v);
                  }}
                  className="flex gap-2"
                >
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    placeholder="Mic not available — type your reply (AI still speaks)"
                    className="flex-1 rounded-full bg-slate-800 px-4 py-2 text-sm text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium"
                  >
                    Reply
                  </button>
                </form>
              )}
              <div className="flex gap-2">
                {micCapable && (
                  <button
                    onClick={() => listen()}
                    className={`flex-1 rounded-full px-4 py-2 text-sm font-medium ${
                      micOn ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {micOn ? '🎤 Listening…' : '🎤 Tap to talk'}
                  </button>
                )}
                <button
                  onClick={endCall}
                  className="flex-1 rounded-full bg-red-500/90 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
                >
                  ✕ End call
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ───────── Live CRM + post-call summary ───────── */}
      <section className="flex h-[640px] flex-col gap-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Live CRM · updated from the call
        </h2>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-base font-semibold text-slate-800">{lead.contactName}</div>
              <div className="text-xs text-slate-400">{lead.phone} · inbound call</div>
            </div>
            <div className={`rounded-full ${catColor} px-3 py-1 text-sm font-semibold text-white`}>
              {lead.category} · {lead.score}
            </div>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full ${catColor} transition-all duration-500`}
              style={{ width: `${lead.score}%` }}
            />
          </div>
          {lead.assignedTo && (
            <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              👤 Assigned to <b>{lead.assignedTo}</b>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Captured on the call
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

        {summary && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
              📝 AI call summary (auto-generated)
            </div>
            <p className="text-sm text-slate-700">
              <b>Requirements:</b> {summary.requirements}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              <b>Sentiment:</b> {summary.sentiment}
            </p>
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {summary.bullets.map((b) => (
                <li key={b}>• {b}</li>
              ))}
            </ul>
            <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-emerald-800">
              <b>Recommended action:</b> {summary.recommendedAction}
            </p>
          </div>
        )}
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
