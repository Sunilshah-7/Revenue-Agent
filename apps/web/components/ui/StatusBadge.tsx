// Five-variant status badge (per the Key Files Map) shared across the
// seeded Dashboard/Playbooks/Live-Session screens. Note the fifth variant,
// "live", is UI-only pulse styling with no icon/config entry — it isn't a
// SessionStatus value from the backend at all.
import {
  CheckCircle,
  Loader2,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";

type Status = "complete" | "writing" | "researching" | "error" | "live";

const statusConfig: Record<
  Exclude<Status, "live">,
  { label: string; icon: LucideIcon; className: string; spin?: boolean }
> = {
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

export function StatusBadge({ status }: { status: Status }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-badge px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-green-active">
        <span className="h-2 w-2 animate-pulse rounded-full bg-green-active" />
        Live
      </span>
    );
  }

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
