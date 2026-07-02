// Small revenue-score display chip (per the Key Files Map) — a purely
// presentational number badge; the "score" itself is only ever fixture
// data (see app/dashboard/page.tsx's recentSessions) since there is no
// scoring concept in the backend's Data Models or API Contract.
export function ScoreChip({ score }: { score: number }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated text-[13px] font-bold text-text-primary">
      {score}
    </span>
  );
}
