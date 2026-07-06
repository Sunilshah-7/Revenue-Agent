// Entry point of the agent pipeline. Per the Active Decisions Log, this app
// uses a single orchestrator (rather than peer agents talking to each
// other) so the research -> write sequence is explicit, retryable, and
// observable through one linear path instead of implicit agent-to-agent
// messaging. OrchestratorAgent kicks off stage one (research); the
// research -> write handoff (registerResearchToWriterHandoff, below) used
// to live inline in index.ts — moved here so a test harness or the
// live-eval script can wire up the same real hand-off logic without
// duplicating it or importing index.ts's process-level side effects
// (HTTP server, WS upgrade, etc).
import { db } from "../db/client";
import { logger } from "../lib/logger";
import type { SessionInput } from "../types";
import { researchQueue, researchQueueEvents, writerQueue } from "../workers/queue";
import { publishSessionEvent, publishSessionStatus } from "../ws/session";

export class OrchestratorAgent {
  // Called from POST /api/v1/sessions right after the row is inserted.
  async start(sessionId: string, input: SessionInput): Promise<void> {
    // Persist the session as "researching" and store the validated input
    // before any queue work happens, so the row reflects reality even if
    // the process crashes between here and the enqueue below.
    await db.query(
      `
        UPDATE sessions
        SET status = 'researching', input = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [sessionId, JSON.stringify(input)],
    );

    // Lets a browser connected to /ws/session/:id before the job even runs
    // still see the status transition.
    await publishSessionStatus(sessionId, "researching");

    // Same retry/backoff shape as the writer job enqueue in index.ts —
    // exponential backoff over 3 attempts, and failed jobs are kept
    // (removeOnFail: false) for later inspection rather than discarded.
    await researchQueue.add(
      "research",
      { sessionId, input },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 500 },
        removeOnComplete: { age: 3600 },
        removeOnFail: false,
      },
    );

    logger.info("Research job enqueued", { sessionId });
  }
}

export const orchestratorAgent = new OrchestratorAgent();

// Shared by every failure path in the handoff below (research job failure,
// writer job failure, and an exception inside the research "completed"
// handler itself) so a session is never left stuck in
// "researching"/"writing" — two rows previously got stuck that way because
// the "completed" handler had no try/catch: its own DB update or
// writerQueue.add() could throw after the research job had already
// succeeded, so BullMQ's "failed" event never fired for it and nothing
// else marked the session as errored.
export async function markSessionError(
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

// The hinge of the orchestration pipeline: advances a session from
// "researching" to "writing" once the research worker's job resolves, by
// reading the research result out of the job's return value and
// enqueueing the writer job with it. There is no direct call from the
// research worker into the writer queue — this decoupling through
// QueueEvents is what lets research and writing be retried, observed, and
// scaled independently (see Active Decisions Log). Call once per process
// (server boot in index.ts, or a test/eval harness that needs the real
// hand-off).
export function registerResearchToWriterHandoff(): void {
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
}
