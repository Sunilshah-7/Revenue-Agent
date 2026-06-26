export interface ResearchResult {
  summary: string;
}

export class ResearchAgent {
  formatResult(summary: string): ResearchResult {
    return { summary };
  }
}
