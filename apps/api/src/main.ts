import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { loadConfig } from '@propulse/config';
import { createLogger } from '@propulse/observability';
import { AppModule } from './app.module.js';

/**
 * Composition root. Boots the NestJS modular monolith: REST (versioned at /api/v1) + the
 * shared guards/filters/interceptors. WebSocket gateways attach via their context modules.
 */
async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger('api');

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();

  const port = config.http.apiPort;
  await app.listen(port);
  logger.info({ port }, 'Propulse AI API listening');
}

void bootstrap();
