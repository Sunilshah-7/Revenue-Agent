// Integration test for the real research -> write pipeline: starts the
// actual BullMQ workers and the real orchestrator hand-off (no mocked
// queues/workers), against local Postgres/Redis, with only the Groq LLM
// mocked (NODE_ENV=test, set automatically by `bun test`, activates
// lib/groq.ts's mock path — equivalent to USE_MOCK_LLM=true per
// isMockMode()). Verifies plumbing and output-type selection per fixture,
// not prompt/grounding quality — that's scripts/live-eval.ts's job against
// real Groq.
import { afterAll, describe, expect, test } from "bun:test";
import { corvidAnalyticsFixture } from "../fixtures/prospects/corvid-analytics.fixture";
import { harlowFinchFixture } from "../fixtures/prospects/harlow-finch.fixture";
import { db } from "../db/client";
import { startResearchWorker } from "../workers/research.worker";
import { startWriterWorker } from "../workers/writer.worker";
import { researchQueue, researchQueueEvents, writerQueue } from "../workers/queue";
import { orchestratorAgent, registerResearchToWriterHandoff } from "./orchestrator";

// Started at module scope (mirroring index.ts) so the workers and the
// research->writer hand-off are live before any test enqueues a job.
const researchWorker = startResearchWorker();
const writerWorker = startWriterWorker();
registerResearchToWriterHandoff();

afterAll(async () => {
  await Promise.all([
    researchWorker.close(),
    writerWorker.close(),
    researchQueue.close(),
    writerQueue.close(),
    researchQueueEvents.close(),
    db.end(),
  ]);
});

async function runSessionToCompletion(prospectContext: string): Promise<{
  status: string;
  output: string | null;
}> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO sessions (status, input) VALUES ('idle', $1) RETURNING id`,
    [JSON.stringify({ prospectContext })],
  );
  const sessionId = inserted.rows[0].id;

  await orchestratorAgent.start(sessionId, { prospectContext });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await db.query<{ status: string; output: string | null }>(
      `SELECT status, output FROM sessions WHERE id = $1`,
      [sessionId],
    );
    const { status, output } = result.rows[0];
    if (status === "complete" || status === "error") {
      return { status, output };
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new Error(`Session ${sessionId} did not reach a terminal status within 20s`);
}

describe("research -> write pipeline (mocked LLM)", () => {
  test("Corvid Analytics fixture reaches complete with a business-case-shaped output", async () => {
    const { status, output } = await runSessionToCompletion(
      corvidAnalyticsFixture.prospectContext,
    );

    expect(status).toBe("complete");
    expect(output).not.toBeNull();
    expect(output).not.toStartWith("This is a disqualification memo");
    expect(output).not.toStartWith("This prospect qualifies, but no playbook context");
    expect(output).toContain("## Qualification Score");
  });

  test("Harlow & Finch fixture reaches complete with a disqualification-shaped output", async () => {
    const { status, output } = await runSessionToCompletion(
      harlowFinchFixture.prospectContext,
    );

    expect(status).toBe("complete");
    expect(output).not.toBeNull();
    expect(output).toStartWith("This is a disqualification memo, not a business case.");
    expect(output).toContain("## Qualification Score");
  });
});
