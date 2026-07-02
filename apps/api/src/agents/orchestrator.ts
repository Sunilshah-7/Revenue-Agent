// Entry point of the agent pipeline. Per the Active Decisions Log, this app
// uses a single orchestrator (rather than peer agents talking to each
// other) so the research -> write sequence is explicit, retryable, and
// observable through one linear path instead of implicit agent-to-agent
// messaging. OrchestratorAgent only kicks off stage one (research); the
// research -> write handoff itself lives in the researchQueueEvents
// "completed" listener in index.ts, not in this class.
import { db } from "../db/client";
import { logger } from "../lib/logger";
import type { SessionInput } from "../types";
import { researchQueue } from "../workers/queue";
import { publishSessionStatus } from "../ws/session";

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
