// Stage one of the agent pipeline: retrieves relevant playbook chunks for
// the prospect context, then streams a Groq-generated research summary,
// forwarding each token live over Redis pub/sub so the browser can render
// it as it's produced. The job's return value (the full `summary` string)
// is what the researchQueueEvents "completed" listener in index.ts reads
// to hand off to the writer stage — there's no separate "save research
// result" step, the BullMQ return value *is* the handoff payload.
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

      // playbookId (optional) scopes retrieval to one document; omitted
      // means search across all indexed playbooks.
      const retrieved = await retrieveTopChunks(
        input.prospectContext,
        5,
        input.playbookId,
      );
      // Numbered [#n] citation markers give the LLM a way to reference
      // specific retrieved snippets in its summary.
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

      // Visual separator token so the browser's stream shows a break
      // before the writer stage's tokens start arriving on the same
      // session channel.
      await publishSessionEvent(sessionId, { type: "token", data: "\n\n" });
      return summary;
    },
    {
      connection: redisConnection,
      // Concurrency 2 plus a capped exponential backoff keeps this worker
      // within Groq's free-tier rate limits (30 req/min, 6k tokens/min per
      // Known Constraints) rather than hammering retries.
      concurrency: 2,
      settings: {
        backoffStrategy: (attemptsMade) =>
          Math.min(5000, 2 ** attemptsMade * 250),
      },
    },
  );
}
