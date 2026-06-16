import { DemoConsole } from '../../features/demo/components/demo-console';
import { DemoNav } from '../../features/demo/components/demo-nav';

export const metadata = {
  title: 'Propulse AI — Live Demo',
  description: 'Watch an AI pre-sales employee qualify a real-estate buyer in real time.',
};

/**
 * Interactive PREVIEW of the Primary Inbound Journey (PRD): a buyer chats on the left, and
 * the AI captures requirements, scores the lead, and populates the CRM on the right — live.
 * Uses a MOCK rule-based AI (no API key, no backend, no DB). Real OpenAI + persistence are
 * wired in roadmap Phases 3–5 behind the same interfaces.
 */
export default function DemoPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DemoNav active="chat" />
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          Preview · mock AI · no API key needed
        </div>
        <h1 className="text-2xl font-bold text-slate-900">
          Watch an AI employee qualify a buyer — live
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Type as a property buyer on the left (or tap a sample). The AI understands the message —
          including Telugu/Hindi mixed with English — captures the requirements, scores the lead
          Hot/Warm/Cold, advances the pipeline, and books a site visit, all updating the CRM on the
          right in real time. This is the inbound journey from the PRD, running with a stand-in AI;
          plug in OpenAI later and the same flow goes live.
        </p>
      </div>
      <DemoConsole />
    </main>
  );
}
