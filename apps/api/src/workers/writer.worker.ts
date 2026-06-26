import { Worker } from "bullmq";
import { db } from "../db/client";
import { createCompletion } from "../lib/groq";
import { redisConnection } from "../redis/client";
import {
  publishSessionEvent,
  publishSessionStatus,
  streamTextAsTokens,
} from "../ws/session";

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

      const businessCase = await createCompletion([
        {
          role: "system",
          content:
            "You are a GTM strategist. Generate a concise business case with sections: Executive Summary, Opportunity, Risks, Proposed Actions, and Success Metrics.",
        },
        {
          role: "user",
          content: `Prospect context:\n${prospectContext}\n\nResearch summary:\n${researchSummary}`,
        },
      ]);

      await streamTextAsTokens(sessionId, businessCase);

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
      concurrency: 2,
      settings: {
        backoffStrategy: (attemptsMade) =>
          Math.min(5000, 2 ** attemptsMade * 250),
      },
    },
  );
}
