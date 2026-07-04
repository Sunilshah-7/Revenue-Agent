// Status badge for a document's ingestion lifecycle (processing | ready |
// failed) — mirrors StatusBadge.tsx's shape/tokens but covers
// DocumentStatus instead of SessionStatus, since the two enums don't share
// values (e.g. no "idle"/"writing" for a document).
import {
  CheckCircle,
  Loader2,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { DocumentStatus } from "../../types";

const statusConfig: Record<
  DocumentStatus,
  { label: string; icon: LucideIcon; className: string; spin?: boolean }
> = {
  ready: {
    label: "Ready",
    icon: CheckCircle,
    className: "border-green-active/30 bg-green-active/15 text-green-active",
  },
  processing: {
    label: "Processing",
    icon: Loader2,
    className:
      "border-blue-research/30 bg-blue-research/15 text-blue-research",
    spin: true,
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "border-red-error/30 bg-red-error/15 text-red-error",
  },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${config.className}`}
    >
      <Icon className={`h-3 w-3 ${config.spin ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}
