// Central registry of the three BullMQ queues (Queue = the producer/
// enqueue-side handle). Routes and other workers import from here rather
// than constructing their own Queue instances, so there is exactly one
// queue object per named queue in the process.
import { Queue, QueueEvents } from "bullmq";
import { redisConnection } from "../redis/client";

// Fan-out target for per-chunk embedding jobs enqueued by
// routes/documents.ts (and routes/documents.reembed.ts) after a document is
// chunked.
export const embedQueue = new Queue("embed", { connection: redisConnection });

// Shared enqueue options for embed jobs — mirrors the retry/backoff shape
// already used for research/writer jobs below, so a transient embed
// failure gets retried before a document is ever marked 'failed'.
export const EMBED_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 500 },
  removeOnComplete: { age: 3600 },
  removeOnFail: false,
};
// Enqueued by OrchestratorAgent.start() when a session begins.
export const researchQueue = new Queue("research", {
  connection: redisConnection,
});
// Enqueued by the researchQueueEvents "completed" listener in index.ts.
export const writerQueue = new Queue("write", { connection: redisConnection });

// QueueEvents is a separate BullMQ primitive from Queue/Worker: it
// subscribes to a Redis-backed event stream for a queue so listeners
// outside the worker process (here, in index.ts) can react to job
// completion/failure. "research" needs this because its completion
// triggers cross-queue orchestration (enqueueing the writer job); "embed"
// needs it so index.ts can flip a document's status to 'ready'/'failed' as
// its per-chunk embed jobs finish (see the ingestion-status listeners).
export const researchQueueEvents = new QueueEvents("research", {
  connection: redisConnection,
});
export const embedQueueEvents = new QueueEvents("embed", {
  connection: redisConnection,
});
