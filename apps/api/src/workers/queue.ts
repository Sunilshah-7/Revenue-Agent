// Central registry of the three BullMQ queues (Queue = the producer/
// enqueue-side handle). Routes and other workers import from here rather
// than constructing their own Queue instances, so there is exactly one
// queue object per named queue in the process.
import { Queue, QueueEvents } from "bullmq";
import { redisConnection } from "../redis/client";

// Fan-out target for per-chunk embedding jobs enqueued by
// routes/documents.ts after a document is chunked.
export const embedQueue = new Queue("embed", { connection: redisConnection });
// Enqueued by OrchestratorAgent.start() when a session begins.
export const researchQueue = new Queue("research", {
  connection: redisConnection,
});
// Enqueued by the researchQueueEvents "completed" listener in index.ts.
export const writerQueue = new Queue("write", { connection: redisConnection });

// QueueEvents is a separate BullMQ primitive from Queue/Worker: it
// subscribes to a Redis-backed event stream for a queue so listeners
// outside the worker process (here, in index.ts) can react to job
// completion/failure. Only "research" needs this because it's the only
// queue whose completion triggers cross-queue orchestration (enqueueing
// the writer job).
export const researchQueueEvents = new QueueEvents("research", {
  connection: redisConnection,
});
