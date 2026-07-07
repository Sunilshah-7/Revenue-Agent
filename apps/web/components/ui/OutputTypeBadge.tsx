// Distinguishes the writer agent's three mutually exclusive output shapes
// (see WRITER_SYSTEM_PROMPT in apps/api/src/workers/writer.worker.ts) by
// matching the literal opening line the prompt requires each memo case to
// start with. Must stay in sync with that prompt's Line 1 strings if they
// ever change. A business case has neither literal line, so it's the
// fallback rather than something matched positively.
import { AlertTriangle, FileText, XCircle, type LucideIcon } from "lucide-react";

const DISQUALIFIED_PREFIX = "This is a disqualification memo, not a business case.";
const NO_COVERAGE_PREFIX =
  "This prospect qualifies, but no playbook context was available";

type OutputType = "disqualified" | "no-coverage" | "business-case";

const config: Record<
  OutputType,
  { label: string; icon: LucideIcon; className: string }
> = {
  disqualified: {
    label: "Disqualified",
    icon: XCircle,
    className: "border-red-error/30 bg-red-error/15 text-red-error",
  },
  "no-coverage": {
    label: "Coverage Gap",
    icon: AlertTriangle,
    className:
      "border-amber-writing/30 bg-amber-writing/15 text-amber-writing",
  },
  "business-case": {
    label: "Business Case",
    icon: FileText,
    className: "border-green-active/30 bg-green-active/15 text-green-active",
  },
};

function classifyOutput(output: string): OutputType {
  const firstLine = output.trimStart().split("\n")[0] ?? "";
  if (firstLine.startsWith(DISQUALIFIED_PREFIX)) {
    return "disqualified";
  }
  if (firstLine.startsWith(NO_COVERAGE_PREFIX)) {
    return "no-coverage";
  }
  return "business-case";
}

export function OutputTypeBadge({ output }: { output: string }) {
  if (output.trim().length === 0) {
    return null;
  }

  const { label, icon: Icon, className } = config[classifyOutput(output)];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${className}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
