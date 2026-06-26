import { Worker } from "bullmq";
import { streamCompletion } from "../lib/groq";
import { retrieveTopChunks } from "../rag/retrieve";
import { redisConnection } from "../redis/client";
import { publishSessionEvent, publishSessionStatus } from "../ws/session";

interface ResearchJobData {
  sessionId: string;
  input: {
    playbookId?: string;
    prospectContext: string;
  };
}

export function startResearchWorker(): Worker<ResearchJobData, string> {
  return new Worker<ResearchJobData, string>(
    "research",
    async (job) => {
      const { sessionId, input } = job.data;
      await publishSessionStatus(sessionId, "researching");

      const retrieved = await retrieveTopChunks(
        input.prospectContext,
        5,
        input.playbookId,
      );
      const context = retrieved
        .map((chunk, idx) => `[#${idx + 1}] ${chunk.content}`)
        .join("\n\n");

      let summary = "";
      for await (const token of streamCompletion([
        {
          role: "system",
          content:
            "You are a revenue research assistant. Produce an evidence-grounded research summary from provided playbook snippets.",
        },
        {
          role: "user",
          content: `Prospect context:\n${input.prospectContext}\n\nRetrieved playbook context:\n${context}`,
        },
      ])) {
        summary += token;
        await publishSessionEvent(sessionId, { type: "token", data: token });
      }

      await publishSessionEvent(sessionId, { type: "token", data: "\n\n" });
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
