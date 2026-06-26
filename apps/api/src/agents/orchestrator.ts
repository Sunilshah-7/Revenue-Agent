import { db } from "../db/client";
import { logger } from "../lib/logger";
import type { SessionInput } from "../types";
import { researchQueue } from "../workers/queue";
import { publishSessionStatus } from "../ws/session";

export class OrchestratorAgent {
  async start(sessionId: string, input: SessionInput): Promise<void> {
    await db.query(
      `
        UPDATE sessions
        SET status = 'researching', input = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [sessionId, JSON.stringify(input)],
    );

    await publishSessionStatus(sessionId, "researching");

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
