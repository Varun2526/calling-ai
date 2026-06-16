import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';

/**
 * VoiceSessionGateway — the realtime media loop for a single live call. SKELETON ONLY.
 *
 * Pipeline (latency budget: user-stops-speaking -> AI audio-starts < 1.2s p95, PERFORMANCE_GUIDELINES):
 *   Twilio media stream (inbound audio frames)
 *     -> Deepgram STT (stream PARTIAL transcripts; do NOT wait for final)
 *     -> AI Employee reasoning (start on partials; KB + CRM search via ports)
 *     -> ElevenLabs TTS (stream audio back)
 *     -> Twilio (outbound audio) ; barge-in cancels in-flight TTS on new speech.
 *
 * Why a SEPARATE service from apps/api (ADR-0005): sessions are long-lived, stateful, and
 * latency-critical. A routine api deploy must never kill a live call. Session state is
 * checkpointed to Redis so a draining task can hand off; ECS routes calls to sticky tasks
 * and scales on CONCURRENT ACTIVE CALLS.
 *
 * Boundary: reasoning/knowledge/CRM are invoked via application ports — no business logic or
 * cross-context table access lives here (AI_AGENT_GUIDELINES).
 */
@WebSocketGateway({ namespace: '/voice' })
export class VoiceSessionGateway implements OnGatewayConnection, OnGatewayDisconnect {
  handleConnection(client: Socket): void {
    // TODO: authenticate the media session, load/create VoiceSession, restore Redis checkpoint.
    void client;
  }

  handleDisconnect(client: Socket): void {
    // TODO: finalize call, enqueue post-call jobs (calls.transcribe -> calls.summarize -> CRM update).
    void client;
  }

  @SubscribeMessage('media')
  handleMedia(): void {
    // TODO: feed audio frame to STT; on partial transcript, drive the reasoning+TTS loop.
  }

  @SubscribeMessage('barge_in')
  handleBargeIn(): void {
    // TODO: cancel in-flight TTS playback when the caller starts speaking (interruptions).
  }
}
