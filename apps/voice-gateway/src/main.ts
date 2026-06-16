import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@propulse/config';
import { createLogger } from '@propulse/observability';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger('voice-gateway');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();

  const port = config.http.voiceGatewayPort;
  await app.listen(port);
  logger.info({ port }, 'Propulse AI voice-gateway listening');
}

void bootstrap();
