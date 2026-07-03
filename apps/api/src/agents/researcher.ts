// Defines the research stage's domain result shape. The actual retrieval +
// Groq streaming logic lives in workers/research.worker.ts, which calls
// `formatResult` at the end purely to normalize its return value into this
// named type rather than a bare string — keeping the "what a research stage
// produces" contract in the agents layer even though execution is worker-
// driven.
export interface ResearchResult {
  summary: string;
}

export class ResearchAgent {
  formatResult(summary: string): ResearchResult {
    return { summary };
  }
}
