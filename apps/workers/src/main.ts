import 'reflect-metadata';

import { Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { loadConfig } from '@propulse/config';
// import { createLogger } from '@propulse/observability'; // shared structured logger (CloudWatch/Sentry).

import { QUEUE } from './queues.js';
import { processIngestion } from './processors/ingestion.processor.js';
import { processNotification } from './processors/notifications.processor.js';
import { runOutboxRelayTick } from './processors/outbox-relay.processor.js';

/**
 * apps/workers bootstrap — the async side of Propulse AI (ARCHITECTURE §8/§9).
 *
 * "One image, many roles" (REPOSITORY_STRUCTURE §5.7): this single entrypoint can run all
 * queue processors, or a subset selected by env, so the same Docker image scales each
 * queue independently on ECS by queue depth (ARCHITECTURE §12).
 *
 * !!! Workers contain NO new business logic (AI_AGENT_GUIDELINES). Every processor is a
 * thin adapter that resolves tenant context and INVOKES an application use case that lives
 * in `apps/api/src/contexts/<context>/application` and is reused via shared packages — it
 * never re-implements domain rules. The domain has exactly one home.
 */
async function bootstrap(): Promise<void> {
  const config = loadConfig();
  // const logger = createLogger({ service: 'workers', level: config.observability.logLevel });
  const logger = console; // TODO: replace with @propulse/observability logger.

  // Single shared Redis connection for BullMQ Workers (ARCHITECTURE §1 Redis/ElastiCache).
  // `redis` is the real ioredis instance (for lifecycle .quit()); `connection` is the same
  // instance presented as BullMQ's ConnectionOptions — the cast bridges the well-known
  // duplicate ioredis type-identity between bullmq's bundled types and our ioredis.
  const redis = new IORedis(config.redis.url, {
    maxRetriesPerRequest: null, // required by BullMQ for blocking commands.
  });
  const connection = redis as unknown as ConnectionOptions;

  // Register one BullMQ Worker per queue. Per-queue concurrency/rate-limits act as shock
  // absorbers and protect third-party quotas (ARCHITECTURE §12).
  const workers: Worker[] = [
    new Worker(QUEUE.KB_INGEST, processIngestion, { connection }),
    new Worker(QUEUE.NOTIFICATIONS_DISPATCH, processNotification, { connection }),
    // TODO: register the remaining processors (kb.embed, calls.transcribe, calls.summarize,
    // campaign.outreach, followup.fire, analytics.project) as they are implemented.
  ];

  // The transactional Outbox relay runs as a poll loop rather than a queue consumer: it is
  // the *producer* that feeds the queues above by draining committed outbox rows
  // (ARCHITECTURE §8). TODO: swap polling for Postgres LISTEN/NOTIFY to cut latency.
  const RELAY_INTERVAL_MS = 1_000;
  const relayTimer = setInterval(() => {
    void runOutboxRelayTick(connection).catch((err) =>
      logger.error('[outbox.relay] tick failed', err),
    );
  }, RELAY_INTERVAL_MS);

  logger.log(`[workers] started ${workers.length} worker(s) + outbox relay`);

  // Graceful shutdown: on SIGTERM (ECS task drain) stop the relay, then close each Worker.
  // `worker.close()` waits for in-flight jobs to finish (drain) before exiting, so no job
  // is lost or left half-done during a deploy (ARCHITECTURE §12 stateless/drainable).
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.log(`[workers] ${signal} received — draining...`);
    clearInterval(relayTimer);
    await Promise.allSettled(workers.map((w) => w.close()));
    await redis.quit();
    logger.log('[workers] drained, exiting');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
