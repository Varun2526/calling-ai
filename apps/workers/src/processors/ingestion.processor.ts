/**
 * Knowledge Base ingestion processor (queue: `kb.ingest`).
 *
 * Domain flow (ARCHITECTURE §9, BC-5 Knowledge Base): a Knowledge Source is ingested as
 *   source -> extract -> chunk -> embed -> index
 * This processor handles the first stage and chains the rest by enqueuing `kb.embed`.
 *
 * IMPORTANT (AI_AGENT_GUIDELINES): this processor contains NO new business logic. It is a
 * thin BullMQ adapter that invokes the Knowledge Base application use case which already
 * lives in `apps/api/src/contexts/knowledge-base/application` (reused via a package, not
 * duplicated). The handler must be IDEMPOTENT — at-least-once delivery means it can run
 * twice for the same job; dedupe by source/document id.
 */

import type { Job } from 'bullmq';

/** Job payload for `kb.ingest`. Always tenant-scoped (ARCHITECTURE §10). */
export interface IngestionJobData {
  organizationId: string;
  knowledgeSourceId: string;
}

/**
 * Processor function passed to a BullMQ Worker in main.ts.
 * @returns a small result for observability/metrics (e.g. chunk count).
 */
export async function processIngestion(job: Job<IngestionJobData>): Promise<{ chunks: number }> {
  const { organizationId, knowledgeSourceId } = job.data;
  void organizationId;
  void knowledgeSourceId;

  // TODO: resolve tenant context from job.data.organizationId, then invoke the KB use case:
  //   const result = await ingestKnowledgeSource.execute({ organizationId, knowledgeSourceId });
  // TODO: on success, enqueue follow-on `kb.embed` jobs for each produced chunk.
  // TODO: idempotency — skip work already completed for this knowledgeSourceId.

  return { chunks: 0 };
}
