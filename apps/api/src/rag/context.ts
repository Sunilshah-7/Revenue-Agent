// Turns retrieved chunks (rag/retrieve.ts) into the numbered context block
// injected into a Groq prompt (research.worker.ts, routes/query.ts) —
// deduplicated and capped by a word budget so a retrieval that happens to
// return several large or overlapping chunks can't blow past Groq's 6K TPM
// free-tier limit (see Known Constraints in CLAUDE.md) in one request.
import type { RetrievedChunk } from "./retrieve";

// Word count (not a real tokenizer) sized to leave headroom for the
// system/user prompt and completion tokens within the 6K TPM budget —
// consistent with rag/chunk.ts's own word-based chunk sizing, and avoids
// adding a tokenizer dependency for an estimate that only needs to be
// roughly right.
export const MAX_CONTEXT_WORDS = 1500;

export interface AssembledContext {
  context: string;
  usedChunks: RetrievedChunk[];
  truncated: boolean;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Chunks are expected pre-sorted by score descending (rag/retrieve.ts's
// ORDER BY) — dedup keeps the first (highest-scored) occurrence of any
// doc_id+content pair, and the word budget is spent highest-score-first so
// truncation always drops the weakest matches, never the strongest.
export function assembleContext(
  chunks: RetrievedChunk[],
  maxWords: number = MAX_CONTEXT_WORDS,
): AssembledContext {
  const seen = new Set<string>();
  const usedChunks: RetrievedChunk[] = [];
  let totalWords = 0;
  let truncated = false;

  for (const chunk of chunks) {
    const key = `${chunk.doc_id}:${chunk.content}`;
    if (seen.has(key)) {
      truncated = true;
      continue;
    }
    seen.add(key);

    const words = wordCount(chunk.content);
    // Always keep at least the single highest-scored chunk, even if it
    // alone exceeds the budget, so a truncation setting can't produce
    // empty context out of otherwise-valid retrieval results.
    if (usedChunks.length > 0 && totalWords + words > maxWords) {
      truncated = true;
      continue;
    }

    usedChunks.push(chunk);
    totalWords += words;
  }

  const context = usedChunks
    .map(
      (chunk, index) =>
        `[#${index + 1}] score=${chunk.score.toFixed(4)}\n${chunk.content}`,
    )
    .join("\n\n");

  return { context, usedChunks, truncated };
}
