/**
 * Browser speech layer for the voice-agent PREVIEW. Uses the built-in Web Speech API
 * (SpeechSynthesis for TTS, SpeechRecognition for STT) so the AI can talk and listen with
 * NO API key. In production this whole module is replaced by the real telephony pipeline —
 * Twilio media stream ↔ Deepgram STT ↔ ElevenLabs TTS in apps/voice-gateway (ADR-0005) —
 * behind the same `speak()` / recognizer interface.
 */

/* Minimal ambient types for the Web Speech API (not in lib.dom by default). */
interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
  isFinal: boolean;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export const isSpeechSupported = (): boolean =>
  typeof window !== 'undefined' && 'speechSynthesis' in window;

export const isMicSupported = (): boolean => getRecognitionCtor() !== undefined;

/** Speak text aloud; resolves when finished (or immediately if unsupported). */
export function speak(text: string, lang = 'en-IN'): Promise<void> {
  return new Promise((resolve) => {
    if (!isSpeechSupported()) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel(); // barge-in: stop anything already speaking
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.04;
    u.pitch = 1.0;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export function stopSpeaking(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
}

export interface Recognizer {
  start(): void;
  stop(): void;
}

/** Create a one-utterance recognizer. Calls onFinal with the transcript, then onEnd. */
export function createRecognizer(opts: {
  lang?: string;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd?: () => void;
  onError?: (err: string) => void;
}): Recognizer | undefined {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return undefined;
  const rec = new Ctor();
  rec.lang = opts.lang ?? 'en-IN';
  rec.continuous = false;
  rec.interimResults = true;

  let finalText = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r) continue;
      const t = r[0].transcript;
      if (r.isFinal) finalText += t;
      else interim += t;
    }
    if (interim && opts.onInterim) opts.onInterim(interim);
  };
  rec.onerror = (e) => opts.onError?.(e.error);
  rec.onend = () => {
    if (finalText.trim()) opts.onFinal(finalText.trim());
    opts.onEnd?.();
  };

  return {
    start: () => {
      finalText = '';
      try {
        rec.start();
      } catch {
        /* already started */
      }
    },
    stop: () => rec.stop(),
  };
}
