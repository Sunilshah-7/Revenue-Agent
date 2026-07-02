// Mirror of researcher.ts for the writing stage: the domain result shape a
// business-case-generation run produces. workers/writer.worker.ts streams
// the actual Groq tokens and calls `formatResult` once streaming completes,
// before persisting `output` to the sessions table.
export interface BusinessCaseResult {
  output: string;
}

export class WriterAgent {
  formatResult(output: string): BusinessCaseResult {
    return { output };
  }
}
