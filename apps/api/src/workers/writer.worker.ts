// Final stage of the agent pipeline: takes the research summary handed off
// from the research stage and streams a Groq-generated business case,
// again forwarding tokens live over Redis pub/sub. Unlike the research
// worker, this stage's job has no further queue to hand off to — it is
// terminal, so it persists the finished output straight to Postgres and
// emits "done" itself.
import { Worker } from "bullmq";
import { db } from "../db/client";
import { streamCompletion } from "../lib/groq";
import { redisConnection } from "../redis/client";
import { publishSessionEvent, publishSessionStatus } from "../ws/session";

interface WriterJobData {
  sessionId: string;
  prospectContext: string;
  researchSummary: string;
}

export function startWriterWorker(): Worker<WriterJobData> {
  return new Worker<WriterJobData>(
    "write",
    async (job) => {
      const { sessionId, prospectContext, researchSummary } = job.data;
      await publishSessionStatus(sessionId, "writing");

      let businessCase = "";
      for await (const token of streamCompletion([
        {
          role: "system",
          content:
            "You are a GTM strategist. Generate a concise business case with sections: Executive Summary, Opportunity, Risks, Proposed Actions, and Success Metrics.",
        },
        {
          role: "user",
          content: `Prospect context:\n${prospectContext}\n\nResearch summary:\n${researchSummary}`,
        },
      ])) {
        businessCase += token;
        await publishSessionEvent(sessionId, { type: "token", data: token });
      }

      // Single write once the full case is assembled (not streamed to the
      // DB token-by-token) — Postgres only needs the final persisted state,
      // while the browser gets the incremental view purely through Redis
      // pub/sub -> WebSocket.
      await db.query(
        `
          UPDATE sessions
          SET status = 'complete', output = $2, error_message = NULL, updated_at = NOW()
          WHERE id = $1
        `,
        [sessionId, businessCase],
      );

      await publishSessionStatus(sessionId, "complete");
      await publishSessionEvent(sessionId, { type: "done" });
    },
    {
      connection: redisConnection,
      // Same Groq-rate-limit-aware concurrency/backoff shape as the
      // research worker.
      concurrency: 2,
      settings: {
        backoffStrategy: (attemptsMade) =>
          Math.min(5000, 2 ** attemptsMade * 250),
      },
    },
  );
}
