// Final stage of the agent pipeline: takes the research summary handed off
// from the research stage and streams a Groq-generated business case,
// again forwarding tokens live over Redis pub/sub. Unlike the research
// worker, this stage's job has no further queue to hand off to — it is
// terminal, so it persists the finished output straight to Postgres and
// emits "done" itself.
import { Worker } from "bullmq";
import { db } from "../db/client";
import { streamCompletion } from "../lib/groq";
import { logger } from "../lib/logger";
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
// business case it hasn't earned, AND must never mislabel a system-side
// retrieval gap as a prospect-side disqualification. It runs a fixed ICP
// scorecard against only the evidence it was actually given (prospect
// context + retrieved playbook chunks) before writing anything else, and
// the scoring step's outcome — not the model's free judgment — decides
// which of the three mutually exclusive output shapes gets produced.
// Deliberately, qualification (does this prospect fit our ICP?) and
// coverage (did our corpus have anything relevant to say?) are scored as
// two independent questions — a prospect scoring well against the ICP but
// hitting an empty/insufficient retrieval must land in Case C, not Case A,
// or the memo blames the prospect for what is actually a missing-playbook
// gap. Weights/threshold are intentionally simple integers so the model
// can sum them reliably instead of reasoning about fractional confidence
// scores.
export const WRITER_SYSTEM_PROMPT = `You are a GTM strategist operating under a strict qualification-first process. Before writing anything else, run the ICP Qualification Framework below against the prospect context and the retrieved playbook context in the user message. Never skip this step, and never blend its three possible outputs together.

## ICP Qualification Framework
Score each criterion using ONLY evidence stated in the prospect context or the retrieved playbook context. If evidence for a criterion is genuinely absent, score it 0 — never assume a favorable answer.

1. B2B sales motion (weight 3): the prospect sells to other businesses through a sales team, not a purely retail/consumer storefront.
2. Deal complexity (weight 2): purchases involve multiple stakeholders and/or a considered, non-trivial buying process.
3. Dedicated sales/RevOps capacity (weight 2): the prospect has, or is actively building, a sales or revenue-operations function — not a single owner-operator.
4. Growth/budget signal (weight 2): funding stage, revenue scale, or headcount growth consistent with budget for new GTM tooling.
5. Playbook-documented use case match (weight 1): the retrieved playbook context contains a use case, objection, or positioning angle matching this prospect's stated situation. Score this 0 if no playbook context was retrieved at all — but a 0 here does not by itself fail the prospect; see Case C below.

Maximum score: 10. Qualification threshold: 6.

## Mandatory process
1. Score each of the 5 criteria, citing the specific evidence (or explicit absence of evidence) used for each.
2. Sum the criterion scores into one total.
3. Compare the total to the threshold of 6. This is the ONLY qualification question — whether the prospect fits our ICP.
4. Separately and independently, note whether the retrieved playbook context is empty or explicitly marked as having no chunks that met the similarity threshold. This is a coverage question — whether our corpus had anything relevant to say — and must never be treated as evidence against the prospect's qualification.

## Output format rules (apply to all three cases)
Output ONLY the sections listed for the one case that applies — nothing before, between, or after them. Do not narrate which case you picked, do not explain your reasoning outside the listed sections, and do not output the "## Qualification Score" table more than once. Score each criterion exactly once and commit to that table — do not re-evaluate, revise, or second-guess your scores after writing the table; a single first-pass table is final, even if a criterion was ambiguous to score. Line 1 of your entire response must be exactly the quoted header string for the case that applies, verbatim, with no preamble before it.

Case A — total score below 6 (regardless of retrieved context):
Line 1 (verbatim): "This is a disqualification memo, not a business case."
Then, in order:
  1. "## Qualification Score" — the full per-criterion table (criterion, weight, score, evidence/rationale) and the total vs. the threshold of 6.
  2. "## Failing Criteria" — which specific criteria failed and why.
  3. "## Nurture Recommendation" — a brief, realistic next-touch recommendation appropriate to why this prospect didn't qualify.
Do not include an Executive Summary, Opportunity, Proposed Actions, or Success Metrics section. Never invent a product fit, solution, pricing, or case study for a disqualified prospect.

Case B — total score at or above 6, AND retrieved playbook context is sufficient:
Produce a full business case with sections, in order: "## Qualification Score" (showing how it cleared the threshold), "## Executive Summary", "## Opportunity", "## Risks", "## Proposed Actions", "## Success Metrics". Every offering, pricing figure, or case study/proof point must be traceable to a specific passage in the retrieved playbook context provided. If the retrieved context doesn't cover a detail (e.g. pricing), say plainly that it isn't available in playbook context — never invent it. If the retrieved context states an eligibility condition for a specific offering (e.g. a minimum seat count, headcount, or facility count required for a tier or plan), you MUST explicitly compare the prospect's own stated number against that condition in your Opportunity section before naming a tier — for example: "35 seats is below the 50-seat Enterprise minimum, so Growth applies, not Enterprise." Never recommend an offering the prospect's own stated numbers don't meet the eligibility for, even if a different tier sounds like a better narrative fit.

Case C — total score at or above 6, BUT retrieved playbook context is empty or insufficient:
Line 1 (verbatim): "This prospect qualifies, but no playbook context was available — this is a coverage gap, not a disqualification."
Then, in order:
  1. "## Qualification Score" — the full per-criterion table and the total vs. the threshold of 6, showing that it cleared.
  2. "## Coverage Gap" — state plainly that this is a system-side gap, not a prospect problem: no ingested playbook covered this prospect's situation, so no business case can be responsibly written yet.
  3. "## Recommended Next Step" — recommend checking document ingestion status and ingesting a playbook relevant to this prospect's domain, then re-running the session.
Do not include an Executive Summary, Opportunity, Proposed Actions, or Success Metrics section, and never invent a product fit, pricing, or case study to fill the gap.`;

export function startWriterWorker(): Worker<WriterJobData> {
  return new Worker<WriterJobData>(
    "write",
    async (job) => {
      const { sessionId, prospectContext, researchSummary, retrievedContext, hasContext } =
        job.data;

      // Cheap protection if a duplicate writer job slips through the jobId
      // dedup in orchestrator.ts (e.g. Redis state predates that dedup, or a
      // manual/test enqueue bypasses the orchestrator): atomically claim the
      // session by flipping it to 'writing' only if it isn't already
      // 'writing' or 'complete'. Postgres row-level locking makes this
      // race-safe between two concurrent workers — only one UPDATE can win
      // the WHERE condition, so at most one job ever proceeds to stream
      // tokens for a given session. A plain SELECT-then-check would leave a
      // race window between the read and the write.
      const claim = await db.query(
        `
          UPDATE sessions
          SET status = 'writing', updated_at = NOW()
          WHERE id = $1 AND status NOT IN ('writing', 'complete')
        `,
        [sessionId],
      );
      if (claim.rowCount === 0) {
        logger.warn(
          "Skipping duplicate writer job; session already writing/complete",
          { sessionId },
        );
        return;
      }

      await publishSessionStatus(sessionId, "writing");

      // Deliberately neutral: states the fact (no context met threshold)
      // without prescribing an output case. Scoring the ICP framework
      // first and treating qualification/coverage as independent
      // questions — per WRITER_SYSTEM_PROMPT — is what decides between
      // Case A (disqualified) and Case C (qualified, no coverage), not
      // this fallback string.
      const contextSection = hasContext
        ? retrievedContext
        : "No playbook context met the similarity threshold for this prospect context.";

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
