// Status badge covering the real backend SessionStatus values exactly
// (idle | researching | writing | complete | error) — no UI-only variants.
import {
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SessionStatus } from "../../types";

const statusConfig: Record<
  SessionStatus,
  { label: string; icon: LucideIcon; className: string; spin?: boolean }
> = {
  idle: {
    label: "Idle",
    icon: Clock,
    className:
      "border-border-active/60 bg-bg-elevated text-text-secondary",
  },
  complete: {
    label: "Complete",
    icon: CheckCircle,
    className:
      "border-green-active/30 bg-green-active/15 text-green-active",
  },
  writing: {
    label: "Writing",
    icon: Zap,
    className:
      "border-amber-writing/30 bg-amber-writing/15 text-amber-writing",
  },
  researching: {
    label: "Researching",
    icon: Loader2,
    className:
      "border-blue-research/30 bg-blue-research/15 text-blue-research",
    spin: true,
  },
  error: {
    label: "Error",
    icon: XCircle,
    className: "border-red-error/30 bg-red-error/15 text-red-error",
  },
};

export function StatusBadge({ status }: { status: SessionStatus }) {
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
