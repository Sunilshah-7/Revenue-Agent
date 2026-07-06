// Manual eval script — runs both named fixtures through the REAL research
// -> write pipeline against the real Groq API (not mocked) and prints each
// session's final output plus its retrieval trace, for a human to score
// grounding/prompt quality. Deliberately NOT part of `bun test` or CI: it
// spends real Groq quota and its output requires human judgment, not an
// assert(). Run manually:
//   cd apps/api && bun --env-file=.env.local run scripts/live-eval.ts
// Requires local Postgres/Redis running (docker compose -f compose.local.yml
// up -d) and a real GROQ_API_KEY in .env.local with USE_MOCK_LLM=false.
import { corvidAnalyticsFixture } from "../src/fixtures/prospects/corvid-analytics.fixture";
import { harlowFinchFixture } from "../src/fixtures/prospects/harlow-finch.fixture";
import { orchestratorAgent, registerResearchToWriterHandoff } from "../src/agents/orchestrator";
import { db } from "../src/db/client";
import { startResearchWorker } from "../src/workers/research.worker";
import { startWriterWorker } from "../src/workers/writer.worker";
import { researchQueue, researchQueueEvents, writerQueue } from "../src/workers/queue";

const FIXTURES = [corvidAnalyticsFixture, harlowFinchFixture];

async function runSessionToCompletion(prospectContext: string): Promise<{
  status: string;
  output: string | null;
  retrievalTrace: unknown;
}> {
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO sessions (status, input) VALUES ('idle', $1) RETURNING id`,
    [JSON.stringify({ prospectContext })],
  );
  const sessionId = inserted.rows[0].id;

  await orchestratorAgent.start(sessionId, { prospectContext });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const result = await db.query<{
      status: string;
      output: string | null;
      retrieval_trace: unknown;
    }>(`SELECT status, output, retrieval_trace FROM sessions WHERE id = $1`, [sessionId]);
    const { status, output, retrieval_trace: retrievalTrace } = result.rows[0];
    if (status === "complete" || status === "error") {
      return { status, output, retrievalTrace };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Session ${sessionId} did not reach a terminal status within 60s`);
}

async function main() {
  const researchWorker = startResearchWorker();
  const writerWorker = startWriterWorker();
  registerResearchToWriterHandoff();

  try {
    for (const fixture of FIXTURES) {
      console.log(`\n${"=".repeat(80)}\n${fixture.name} (expected: ${fixture.expectedOutputType})\n${"=".repeat(80)}`);
      const { status, output, retrievalTrace } = await runSessionToCompletion(
        fixture.prospectContext,
      );
      console.log(`status: ${status}`);
      console.log(`retrieval_trace: ${JSON.stringify(retrievalTrace, null, 2)}`);
      console.log(`output:\n${output}`);
    }
  } finally {
    await Promise.all([
      researchWorker.close(),
      writerWorker.close(),
      researchQueue.close(),
      writerQueue.close(),
      researchQueueEvents.close(),
      db.end(),
    ]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
