// Stage one of the agent pipeline: retrieves relevant playbook chunks for
// the prospect context, then streams a Groq-generated research summary,
// forwarding each token live over Redis pub/sub so the browser can render
// it as it's produced. The job's return value (the full `summary` string)
// is what the researchQueueEvents "completed" listener in index.ts reads
// to hand off to the writer stage — there's no separate "save research
// result" step, the BullMQ return value *is* the handoff payload.
import { Worker } from "bullmq";
import { db } from "../db/client";
import { streamCompletion } from "../lib/groq";
import { logger } from "../lib/logger";
import { assembleContext } from "../rag/context";
import {
  countIndexedChunks,
  MIN_SIMILARITY_THRESHOLD,
  retrieveTopChunks,
  type RetrievedChunk,
} from "../rag/retrieve";
import { redisConnection } from "../redis/client";
import type { RetrievalTrace } from "../types";
import { publishSessionEvent, publishSessionStatus } from "../ws/session";

interface ResearchJobData {
  sessionId: string;
  input: {
    playbookId?: string;
    prospectContext: string;
  };
}

const RESEARCH_TOP_K = 5;

function chunkFilename(chunk: RetrievedChunk): string {
  const filename = chunk.metadata?.filename;
  return typeof filename === "string" ? filename : "unknown";
}

function chunkIndexOf(chunk: RetrievedChunk): number {
  const chunkIndex = chunk.metadata?.chunkIndex;
  return typeof chunkIndex === "number" ? chunkIndex : -1;
}

// Persists what retrieval actually saw for this session — doc_id,
// filename, chunk_index, score, and a short content preview per chunk,
// plus the query/topK/threshold/filter/candidate-count that produced
// them — so GET /api/v1/sessions/:id can answer "what did the agent see?"
// without anyone re-running SQL by hand.
async function persistRetrievalTrace(
  sessionId: string,
  params: {
    query: string;
    topK: number;
    playbookId: string | null;
    totalCandidates: number;
    truncated: boolean;
    chunks: RetrievedChunk[];
  },
): Promise<void> {
  const trace: RetrievalTrace = {
    query: params.query,
    topK: params.topK,
    threshold: MIN_SIMILARITY_THRESHOLD,
    playbookId: params.playbookId,
    totalCandidates: params.totalCandidates,
    truncated: params.truncated,
    chunks: params.chunks.map((chunk) => ({
      doc_id: chunk.doc_id,
      filename: chunkFilename(chunk),
      chunk_index: chunkIndexOf(chunk),
      score: chunk.score,
      preview: chunk.content.slice(0, 120),
    })),
  };

  await db.query(
    `UPDATE sessions SET retrieval_trace = $2 WHERE id = $1`,
    [sessionId, JSON.stringify(trace)],
  );

  const scores = params.chunks.map((chunk) => chunk.score);
  const distinctFilenames = new Set(params.chunks.map(chunkFilename));
  logger.info("Retrieval trace", {
    sessionId,
    topK: params.topK,
    candidates: params.totalCandidates,
    chunksReturned: params.chunks.length,
    scoreRange:
      scores.length > 0
        ? [Math.min(...scores), Math.max(...scores)]
        : null,
    distinctFilenames: [...distinctFilenames],
  });
}

export function startResearchWorker(): Worker<ResearchJobData, string> {
  return new Worker<ResearchJobData, string>(
    "research",
    async (job) => {
      const { sessionId, input } = job.data;
      await publishSessionStatus(sessionId, "researching");

      // playbookId (optional) scopes retrieval to one document; omitted
      // means search across all indexed playbooks.
      const [retrieved, totalCandidates] = await Promise.all([
        retrieveTopChunks(input.prospectContext, RESEARCH_TOP_K, input.playbookId),
        countIndexedChunks(input.playbookId),
      ]);
      const { context, usedChunks, truncated } = assembleContext(retrieved);

      await persistRetrievalTrace(sessionId, {
        query: input.prospectContext,
        topK: RESEARCH_TOP_K,
        playbookId: input.playbookId ?? null,
        totalCandidates,
        truncated,
        chunks: usedChunks,
      });

      // If nothing cleared the similarity threshold, say so explicitly in
      // the prompt rather than sending an empty "Retrieved playbook
      // context:" section, so the model doesn't fabricate playbook-sourced
      // claims it never actually received.
      const contextSection =
        usedChunks.length > 0
          ? context
          : "No playbook context met the similarity threshold for this prospect context.";

      let summary = "";
      for await (const token of streamCompletion([
        {
          role: "system",
          content:
            "You are a revenue research assistant. Produce an evidence-grounded research summary from provided playbook snippets.",
        },
        {
          role: "user",
          content: `Prospect context:\n${input.prospectContext}\n\nRetrieved playbook context:\n${contextSection}`,
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
