// Process entry point: this single file boots the whole API process —
// the Hono REST layer, the Elysia WebSocket layer, all three BullMQ
// workers, and the queue-completion listeners that chain research -> write.
// Everything below runs once at module load (Bun executes this top-to-bottom
// and then keeps the process alive via the listeners/servers it starts).
import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db/client";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { healthRouter } from "./routes/health";
import { documentsRouter } from "./routes/documents";
import { sessionsRouter } from "./routes/sessions";
import { queryRouter } from "./routes/query";
import { createDocsRouter } from "./docs/router";
import { startEmbedWorker } from "./workers/embed.worker";
import { startResearchWorker } from "./workers/research.worker";
import { startWriterWorker } from "./workers/writer.worker";
import {
  embedQueue,
  embedQueueEvents,
  researchQueue,
  researchQueueEvents,
  writerQueue,
} from "./workers/queue";
import {
  initializeSessionEventBridge,
  publishSessionEvent,
  publishSessionStatus,
  registerSessionSocket,
  unregisterSessionSocket,
} from "./ws/session";

// Hono handles the six REST endpoints (documents/sessions/query/health).
// It is mounted as a catch-all fetch handler inside the Elysia app below so
// both REST and WS traffic share one Bun server/port.
const api = new Hono();

// Single allowed browser origin (FRONTEND_URL) rather than a wildcard,
// since the frontend sends credentials-free but still same-origin-sensitive
// requests through the Next.js proxy routes.
api.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Each router owns its own path prefix internally, so they all mount at "/".
api.route("/", healthRouter);
api.route("/", documentsRouter);
api.route("/", sessionsRouter);
api.route("/", queryRouter);

// Workers are long-running BullMQ consumers; starting them here (rather than
// as separate processes) keeps local dev and the single Railway deployment
// simple at the cost of coupling API uptime to worker uptime.
const embedWorker = startEmbedWorker();
const researchWorker = startResearchWorker();
const writerWorker = startWriterWorker();

// Shared by every failure path below (research job failure, writer job
// failure, and an exception inside the research "completed" handler
// itself) so a session is never left stuck in "researching"/"writing" —
// two rows previously got stuck that way because the "completed" handler
// below had no try/catch: its own DB update or writerQueue.add() could
// throw after the research job had already succeeded, so BullMQ's "failed"
// event never fired for it and nothing else marked the session as errored.
async function markSessionError(
  sessionId: string,
  message: string,
): Promise<void> {
  await db.query(
    `
      UPDATE sessions
      SET status = 'error', error_message = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [sessionId, message],
  );

  await publishSessionEvent(sessionId, { type: "error", message });
}

// This listener is the hinge of the orchestration pipeline: it is what
// advances a session from "researching" to "writing" once the research
// worker's job resolves, by reading the research summary out of the job's
// return value and enqueueing the writer job with it. There is no direct
// call from the research worker into the writer queue — this decoupling
// through QueueEvents is what lets research and writing be retried,
// observed, and scaled independently (see Active Decisions Log).
researchQueueEvents.on("completed", async ({ jobId, returnvalue }) => {
  if (!jobId) {
    return;
  }

  const job = await researchQueue.getJob(jobId);
  if (!job) {
    return;
  }

  const sessionId = job.data.sessionId as string;
  const prospectContext = job.data.input.prospectContext;

  // researchQueueEvents JSON.parses the job's return value before emitting
  // "completed" (see bullmq's queue-events.js), so this is the actual
  // ResearchStageResult object, not a re-stringified summary.
  const researchResult = returnvalue as
    | { summary?: string; retrievedContext?: string; hasContext?: boolean }
    | undefined;

  try {
    await db.query(
      `
        UPDATE sessions
        SET status = 'writing', updated_at = NOW()
        WHERE id = $1
      `,
      [sessionId],
    );

    await publishSessionStatus(sessionId, "writing");

    // Retries/backoff/removeOnFail are set per-enqueue rather than as a
    // queue default so the writer stage's retry policy can diverge from
    // research's if needed; removeOnFail: false keeps failed writer jobs
    // around for inspection instead of silently discarding them.
    await writerQueue.add(
      "write",
      {
        sessionId,
        prospectContext,
        researchSummary: String(researchResult?.summary ?? ""),
        // Raw retrieved playbook chunks (not the paraphrased summary) plus
        // whether retrieval found anything — the writer's qualification and
        // grounding steps need the actual passages, not a paraphrase that
        // may have softened or dropped a detail.
        retrievedContext: String(researchResult?.retrievedContext ?? ""),
        hasContext: Boolean(researchResult?.hasContext),
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: { age: 3600 },
        removeOnFail: false,
      },
    );
  } catch (error) {
    logger.error("Failed to hand research result off to writer queue", {
      sessionId,
      error,
    });
    await markSessionError(
      sessionId,
      error instanceof Error ? error.message : "Failed to enqueue writer job",
    );
  }
});

// If research itself fails (after its own retries are exhausted), the
// session is terminally marked "error" and the writer stage never runs —
// there is no partial/fallback business case.
researchQueueEvents.on("failed", async ({ jobId, failedReason }) => {
  if (!jobId) {
    return;
  }

  const job = await researchQueue.getJob(jobId);
  const sessionId = job?.data.sessionId;
  if (!sessionId) {
    return;
  }

  await markSessionError(sessionId, failedReason ?? "Research failed");
});

// Mirror of the research-failure handler, but bound directly to the writer
// Worker's "failed" event instead of QueueEvents — both approaches exist
// in this file because the writer's completion isn't chained into a further
// stage, so a lighter-weight Worker-level listener suffices here.
writerWorker.on("failed", async (job, error) => {
  const sessionId = job?.data.sessionId;
  if (!sessionId) {
    return;
  }

  await markSessionError(sessionId, error.message);
});

// "error" events are BullMQ/Redis-connection-level failures (distinct from
// job "failed" events above, which are job-logic failures) — these just get
// logged since there's no per-job session to attach the error to.
writerWorker.on("error", (error) => {
  logger.error("Writer worker runtime error", error.message);
});

researchWorker.on("error", (error) => {
  logger.error("Research worker runtime error", error.message);
});

embedWorker.on("error", (error) => {
  logger.error("Embed worker runtime error", error.message);
});

// Flips a document to 'ready' once every one of its chunks has an embedded
// row — chunks_total was recorded at upload time (routes/documents.ts), so
// reaching it here means ingestion is actually complete, not just queued.
// Guarded by `status != 'failed'` so a chunk that finishes after a sibling
// chunk already failed the document can't resurrect it to 'ready'.
embedQueueEvents.on("completed", async ({ jobId }) => {
  if (!jobId) {
    return;
  }

  const job = await embedQueue.getJob(jobId);
  const docId = job?.data.docId as string | undefined;
  if (!docId) {
    return;
  }

  await db.query(
    `
      UPDATE documents d
      SET status = 'ready'
      WHERE d.id = $1
        AND d.status != 'failed'
        AND d.chunks_total <= (
          SELECT COUNT(*) FROM document_chunks c
          WHERE c.doc_id = $1 AND c.embedding IS NOT NULL
        )
    `,
    [docId],
  );
});

// A chunk's embed job exhausting its retries means that document's index is
// permanently incomplete — mark it 'failed' with the reason rather than
// leaving it stuck in 'processing' with no signal anything went wrong.
// Guarded by `status != 'ready'` for the same reason as above: a
// already-completed document should not be downgraded by a late/duplicate
// failure event.
embedQueueEvents.on("failed", async ({ jobId, failedReason }) => {
  if (!jobId) {
    return;
  }

  const job = await embedQueue.getJob(jobId);
  const docId = job?.data.docId as string | undefined;
  if (!docId) {
    return;
  }

  logger.error("Embed job failed, marking document failed", {
    docId,
    filename: job?.data.filename,
    chunkIndex: job?.data.chunkIndex,
    failedReason,
  });

  await db.query(
    `
      UPDATE documents
      SET status = 'failed', error_message = $2
      WHERE id = $1 AND status != 'ready'
    `,
    [docId, failedReason ?? "Embedding failed"],
  );
});

// Subscribes this process to Redis pub/sub channels for session events so
// that tokens/status published by the workers (running in this same
// process, but decoupled via Redis) can be forwarded to connected browsers.
await initializeSessionEventBridge();

// Elysia owns the actual Bun server/port. The WS route registers/
// unregisters each browser socket against the in-memory session->sockets
// map in ws/session.ts; the catch-all "/*" route hands everything else off
// to the Hono `api` app's fetch handler, so one process serves both
// protocols on one port.
//
// @elysiajs/openapi only generates docs from routes declared natively on
// this Elysia instance — it cannot see the Hono routes hidden behind the
// catch-all below. Endpoint documentation is added separately (see
// docs/router.ts) as thin passthrough routes that carry OpenAPI metadata
// and delegate straight back into `api.fetch(request)`; this `.use()` just
// mounts the docs UI itself at GET /openapi (Scalar, the plugin default)
// and GET /openapi/json (raw OpenAPI document).
const app = new Elysia()
  .use(
    openapi({
      documentation: {
        info: {
          title: "ARAP API",
          version: "v2.4",
          description:
            "REST and WebSocket contract for the AI Revenue Agent Platform. " +
            "`/ws/session/:id` below is listed as a bare path — OpenAPI " +
            "3.0 has no request/response semantics for WebSocket " +
            "operations, so its `token`/`status`/`error`/`done` event " +
            "shapes are documented in prose on the Sessions tag instead.",
        },
        tags: [
          {
            name: "Documents",
            description: "Playbook upload and inventory.",
          },
          {
            name: "Sessions",
            description:
              "Agent session lifecycle. Also see /ws/session/:id, which " +
              'streams { type: "token" | "status" | "error" | "done", ... } ' +
              "events for a session over WebSocket once a run starts.",
          },
          {
            name: "Query",
            description: "One-shot RAG query against playbooks.",
          },
          { name: "Health", description: "Operational health check." },
        ],
      },
      // The Hono catch-all is itself a native Elysia route (`.all("/*",
      // ...)` below) and would otherwise show up as a phantom "every
      // method" entry in the generated docs; every path it actually
      // forwards is already documented individually via docs/router.ts.
      exclude: { paths: ["/*"] },
    }),
  )
  .use(createDocsRouter(api))
  .ws("/ws/session/:id", {
    open(ws) {
      const id = String(ws.data.params.id);
      registerSessionSocket(
        id,
        ws as unknown as { send: (data: string) => void },
      );
    },
    close(ws) {
      const id = String(ws.data.params.id);
      unregisterSessionSocket(
        id,
        ws as unknown as { send: (data: string) => void },
      );
    },
  })
  .all("/*", ({ request }) => api.fetch(request));

app.listen(env.PORT);
logger.info(`API + WS server listening on :${env.PORT}`);

// Graceful shutdown: let in-flight BullMQ jobs drain and close the Postgres
// pool cleanly instead of dropping connections when the process is killed
// (e.g. on a Railway redeploy).
process.on("SIGINT", async () => {
  await Promise.all([
    embedWorker.close(),
    researchWorker.close(),
    writerWorker.close(),
    db.end(),
  ]);
  process.exit(0);
});
