// Real fixture reused by the mocked integration test
// (src/agents/orchestrator.test.ts), the live-eval script
// (scripts/live-eval.ts), and Phase 2 threshold calibration. A strong ICP
// fit (B2B SaaS, dedicated sales org, funded, named competitor complaint)
// that should score well above the qualification threshold and, once
// sample-playbook-enterprise-saas.txt is ingested, retrieve sufficient
// context — i.e. this fixture is expected to land in Case B (business
// case), not Case A or C.
export const corvidAnalyticsFixture = {
  name: "Corvid Analytics",
  expectedOutputType: "business-case" as const,
  prospectContext: `Company: Corvid Analytics
Contact: Priya Raman, VP of Sales
Industry: B2B SaaS (data observability), Series B, 420 employees
Sales team: 35 reps
Signal: Engineering headcount up 15% this half; 30 open ML/AI roles on their careers page
Pain: Reps average 4.5 hours/week on manual account research; VP Sales has budget approval up to $150K ACV and wants to consolidate tooling.
Competitor: Team currently trials ProspectIQ but complains it can't write back to Salesforce.
Timeline: Wants a decision before end of Q3.`,
};
