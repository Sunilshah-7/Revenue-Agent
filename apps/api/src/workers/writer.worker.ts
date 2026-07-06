// Final stage of the agent pipeline: takes the research summary handed off
// from the research stage and streams a Groq-generated business case,
// again forwarding tokens live over Redis pub/sub. Unlike the research
// worker, this stage's job has no further queue to hand off to — it is
// terminal, so it persists the finished output straight to Postgres and
// emits "done" itself.
import { Worker } from "bullmq";
import { db } from "../db/client";
import { streamCompletion } from "../lib/groq";
import { redisConnection } from "../redis/client";
import { publishSessionEvent, publishSessionStatus } from "../ws/session";

interface WriterJobData {
  sessionId: string;
  prospectContext: string;
  researchSummary: string;
  // Raw retrieved playbook chunk text (rag/context.ts's assembleContext
  // output) and whether retrieval found anything at all — see
  // research.worker.ts's ResearchStageResult. The qualification/grounding
  // rules below need the actual passages, not the paraphrased summary.
  retrievedContext: string;
  hasContext: boolean;
}

// Hardened per a deliberate rule: this agent must never hand a prospect a
// business case it hasn't earned. It runs a fixed ICP scorecard against
// only the evidence it was actually given (prospect context + retrieved
// playbook chunks) before writing anything else, and the scoring step's
// outcome — not the model's free judgment — decides which of the two
// mutually exclusive output shapes gets produced. Weights/threshold are
// intentionally simple integers so the model can sum them reliably instead
// of reasoning about fractional confidence scores.
export const WRITER_SYSTEM_PROMPT = `You are a GTM strategist operating under a strict qualification-first process. Before writing anything else, run the ICP Qualification Framework below against the prospect context and the retrieved playbook context in the user message. Never skip this step, and never blend its two possible outputs together.

## ICP Qualification Framework
Score each criterion using ONLY evidence stated in the prospect context or the retrieved playbook context. If evidence for a criterion is genuinely absent, score it 0 — never assume a favorable answer.

1. B2B sales motion (weight 3): the prospect sells to other businesses through a sales team, not a purely retail/consumer storefront.
2. Deal complexity (weight 2): purchases involve multiple stakeholders and/or a considered, non-trivial buying process.
3. Dedicated sales/RevOps capacity (weight 2): the prospect has, or is actively building, a sales or revenue-operations function — not a single owner-operator.
4. Growth/budget signal (weight 2): funding stage, revenue scale, or headcount growth consistent with budget for new GTM tooling.
5. Playbook-documented use case match (weight 1): the retrieved playbook context contains a use case, objection, or positioning angle matching this prospect's stated situation.

Maximum score: 10. Qualification threshold: 6.

## Mandatory process
1. Score each of the 5 criteria, citing the specific evidence (or explicit absence of evidence) used for each.
2. Sum the criterion scores into one total.
3. Compare the total to the threshold of 6.
4. Also treat the prospect as failing qualification if the retrieved playbook context is empty or explicitly marked as having no chunks that met the similarity threshold — a business case cannot be grounded in context that doesn't exist, regardless of the numeric score.

## Output rule — pick exactly one
Case A — total score below 6, OR retrieved playbook context is empty/insufficient:
Produce a DISQUALIFICATION MEMO ONLY, in this order:
  1. "## Qualification Score" — the full per-criterion table (criterion, weight, score, evidence/rationale) and the total vs. the threshold of 6.
  2. "## Failing Criteria" — which specific criteria failed and why.
  3. "## Nurture Recommendation" — a brief, realistic next-touch recommendation appropriate to why this prospect didn't qualify.
State explicitly at the top: "This is a disqualification memo, not a business case." Do not include an Executive Summary, Opportunity, Proposed Actions, or Success Metrics section. Never invent a product fit, solution, pricing, or case study for a disqualified prospect.

Case B — total score at or above 6, AND retrieved playbook context is sufficient:
Produce a full business case with sections: "## Qualification Score" (showing how it cleared the threshold), Executive Summary, Opportunity, Risks, Proposed Actions, and Success Metrics. Every offering, pricing figure, or case study/proof point must be traceable to a specific passage in the retrieved playbook context provided. If the retrieved context doesn't cover a detail (e.g. pricing), say plainly that it isn't available in playbook context — never invent it.`;

export function startWriterWorker(): Worker<WriterJobData> {
  return new Worker<WriterJobData>(
    "write",
    async (job) => {
      const { sessionId, prospectContext, researchSummary, retrievedContext, hasContext } =
        job.data;
      await publishSessionStatus(sessionId, "writing");

      const contextSection = hasContext
        ? retrievedContext
        : "No playbook context met the similarity threshold for this prospect context — treat as no usable playbook context and disqualify per Case A.";

      let businessCase = "";
      for await (const token of streamCompletion([
        {
          role: "system",
          content: WRITER_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Prospect context:\n${prospectContext}\n\nResearch summary:\n${researchSummary}\n\nRetrieved playbook context:\n${contextSection}`,
        },
      ])) {
        businessCase += token;
        await publishSessionEvent(sessionId, { type: "token", data: token });
      }

      // Single write once the full case is assembled (not streamed to the
      // DB token-by-token) — Postgres only needs the final persisted state,
      // while the browser gets the incremental view purely through Redis
      // pub/sub -> WebSocket.
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
      // Same Groq-rate-limit-aware concurrency/backoff shape as the
      // research worker.
      concurrency: 2,
      settings: {
        backoffStrategy: (attemptsMade) =>
          Math.min(5000, 2 ** attemptsMade * 250),
      },
    },
  );
}
