# @propulse/voice-gateway

Realtime voice service for Propulse AI. Runs the long-lived media loop for live calls
(Twilio media streams ↔ Deepgram STT ↔ AI Employee reasoning ↔ ElevenLabs TTS).

**Why separate from `apps/api`** ([ADR-0005](../../docs/adr/0005-voice-gateway-separation.md)):
voice sessions are long-lived, stateful, and latency-critical (turn budget < 1.2s p95). A
routine API deploy must never kill a call. Scales on **concurrent active calls**; session
state is checkpointed to Redis so draining tasks can hand off; ECS routes calls to sticky
tasks.

This is a **skeleton** — the realtime pipeline in `src/session/voice-session.gateway.ts` has
TODOs for the provider integrations. Implement in roadmap Phase 6 (inbound voice) and Phase 2
(full realtime/barge-in).

```bash
pnpm --filter @propulse/voice-gateway dev   # tsx watch on VOICE_GATEWAY_PORT (4100)
```
