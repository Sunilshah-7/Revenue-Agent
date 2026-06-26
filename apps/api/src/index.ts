import { Elysia } from "elysia";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { db } from "./db/client";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { healthRouter } from "./routes/health";
import { documentsRouter } from "./routes/documents";
import { sessionsRouter } from "./routes/sessions";
import { queryRouter } from "./routes/query";
import { startEmbedWorker } from "./workers/embed.worker";
import { startResearchWorker } from "./workers/research.worker";
import { startWriterWorker } from "./workers/writer.worker";
import {
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

const api = new Hono();

api.use(
  "*",
  cors({
    origin: env.FRONTEND_URL,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

api.route("/", healthRouter);
api.route("/", documentsRouter);
api.route("/", sessionsRouter);
api.route("/", queryRouter);

const embedWorker = startEmbedWorker();
const researchWorker = startResearchWorker();
const writerWorker = startWriterWorker();

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

  await db.query(
    `
      UPDATE sessions
      SET status = 'writing', updated_at = NOW()
      WHERE id = $1
    `,
    [sessionId],
  );

  await publishSessionStatus(sessionId, "writing");

  await writerQueue.add(
    "write",
    {
      sessionId,
      prospectContext,
      researchSummary: String(returnvalue ?? ""),
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 500 },
      removeOnComplete: { age: 3600 },
      removeOnFail: false,
    },
  );
});

researchQueueEvents.on("failed", async ({ jobId, failedReason }) => {
  if (!jobId) {
    return;
  }

  const job = await researchQueue.getJob(jobId);
  const sessionId = job?.data.sessionId;
  if (!sessionId) {
    return;
  }

  await db.query(
    `
      UPDATE sessions
      SET status = 'error', error_message = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [sessionId, failedReason ?? "Research failed"],
  );

  await publishSessionEvent(sessionId, {
    type: "error",
    message: failedReason ?? "Research failed",
  });
});

writerWorker.on("failed", async (job, error) => {
  const sessionId = job?.data.sessionId;
  if (!sessionId) {
    return;
  }

  await db.query(
    `
      UPDATE sessions
      SET status = 'error', error_message = $2, updated_at = NOW()
      WHERE id = $1
    `,
    [sessionId, error.message],
  );

  await publishSessionEvent(sessionId, {
    type: "error",
    message: error.message,
  });
});

writerWorker.on("error", (error) => {
  logger.error("Writer worker runtime error", error.message);
});

researchWorker.on("error", (error) => {
  logger.error("Research worker runtime error", error.message);
});

embedWorker.on("error", (error) => {
  logger.error("Embed worker runtime error", error.message);
});

await initializeSessionEventBridge();

const app = new Elysia()
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

process.on("SIGINT", async () => {
  await Promise.all([
    embedWorker.close(),
    researchWorker.close(),
    writerWorker.close(),
    db.end(),
  ]);
  process.exit(0);
});
