export interface BusinessCaseResult {
  output: string;
}

export class WriterAgent {
  formatResult(output: string): BusinessCaseResult {
    return { output };
  }
}
