import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { VoiceSessionGateway } from './session/voice-session.gateway.js';

@Module({
  controllers: [HealthController],
  providers: [VoiceSessionGateway],
})
export class AppModule {}
