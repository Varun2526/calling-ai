import { VoiceCall } from '../../../features/demo/components/voice-call';
import { DemoNav } from '../../../features/demo/components/demo-nav';

export const metadata = {
  title: 'Propulse AI — Voice Agent Demo',
  description:
    'Talk to an AI real-estate pre-sales agent. It listens, replies aloud, and fills the CRM.',
};

/**
 * Voice-agent PREVIEW. Uses the browser's built-in speech (Web Speech API) so you can
 * literally talk to the AI with no API key. Mirrors the PRD Voice Agent System
 * (STT → AI reasoning → CRM update → TTS) and produces a post-call AI summary. In production
 * the browser speech is replaced by Twilio + Deepgram + ElevenLabs in apps/voice-gateway.
 */
export default function VoiceDemoPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <DemoNav active="voice" />
      <div className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
          Preview · browser speech · no API key needed
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Talk to the AI voice agent</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Press <b>Start call</b>, allow the microphone, and speak as a property buyer — the AI
          listens, reasons, replies out loud, and updates the CRM live, then writes a call summary
          at the end. Works best in Chrome. No microphone? A text box appears so you can type while
          the AI still speaks. This is the PRD Voice Agent flow; swap in Twilio/Deepgram/ElevenLabs
          for real phone calls.
        </p>
      </div>
      <VoiceCall />
    </main>
  );
}
