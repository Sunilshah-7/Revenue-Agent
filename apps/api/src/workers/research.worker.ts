import { Worker } from "bullmq";
import { createCompletion } from "../lib/groq";
import { retrieveTopChunks } from "../rag/retrieve";
import { redisConnection } from "../redis/client";
import { publishSessionStatus, streamTextAsTokens } from "../ws/session";

interface ResearchJobData {
  sessionId: string;
  input: {
    prospectContext: string;
  };
}

export function startResearchWorker(): Worker<ResearchJobData, string> {
  return new Worker<ResearchJobData, string>(
    "research",
    async (job) => {
      const { sessionId, input } = job.data;
      await publishSessionStatus(sessionId, "researching");

      const retrieved = await retrieveTopChunks(input.prospectContext, 5);
      const context = retrieved
        .map((chunk, idx) => `[#${idx + 1}] ${chunk.content}`)
        .join("\n\n");

      const summary = await createCompletion([
        {
          role: "system",
          content:
            "You are a revenue research assistant. Produce an evidence-grounded research summary from provided playbook snippets.",
        },
        {
          role: "user",
          content: `Prospect context:\n${input.prospectContext}\n\nRetrieved playbook context:\n${context}`,
        },
      ]);

      await streamTextAsTokens(sessionId, summary + "\n\n");
      return summary;
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
