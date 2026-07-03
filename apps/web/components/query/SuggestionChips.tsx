// Horizontally-scrolling row of example-prompt chips shown above the
// composer; clicking one fills the QueryInput textarea (via onSelect)
// rather than submitting immediately.
interface SuggestionChipsProps {
  onSelect: (text: string) => void;
}

// Fixed example prompts — not derived from indexed playbook content.
const CHIPS = [
  "What ROI metrics should I lead with for a fintech prospect?",
  "How do I qualify for budget in a PLG motion?",
  "Draft a cold email for a Series B SaaS company",
  "What's the best ICP for Enterprise SaaS?",
  "How to handle a 'not now' objection at end of quarter?",
];

export function SuggestionChips({ onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-shrink-0 flex-nowrap items-center gap-2 overflow-x-auto px-6 py-2 scrollbar-none">
      <span className="mr-1 flex-shrink-0 text-[11px] text-text-secondary">
        Try:
      </span>
      {CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="flex-shrink-0 whitespace-nowrap rounded-full border border-border-subtle px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
