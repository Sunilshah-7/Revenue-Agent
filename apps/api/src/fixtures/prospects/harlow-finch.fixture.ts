// Real fixture reused by the mocked integration test
// (src/agents/orchestrator.test.ts), the live-eval script
// (scripts/live-eval.ts), and Phase 2 threshold calibration. A weak ICP
// fit (no dedicated sales team, no budget, no considered buying process)
// that should score below the qualification threshold regardless of
// retrieval — i.e. this fixture is expected to land in Case A
// (disqualification memo), not Case B or C.
export const harlowFinchFixture = {
  name: "Harlow & Finch",
  expectedOutputType: "disqualified" as const,
  prospectContext: `Company: Harlow & Finch Booksellers
Contact: Margaret Finch, Office Manager
Industry: Independent bookstore chain, family-owned, 4 locations
Sales team: 2 part-time staff who handle bulk orders to schools
Signal: Recently set up an Instagram account; owner mentioned "AI" at a chamber of commerce event
Pain: Nothing quantified; Margaret says ordering "feels disorganized sometimes"
Timeline: No budget allocated; would revisit "maybe next year"`,
};
