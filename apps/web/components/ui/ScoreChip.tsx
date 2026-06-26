export function ScoreChip({ score }: { score: number }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border-subtle bg-bg-elevated text-[13px] font-bold text-text-primary">
      {score}
    </span>
  );
}
