"use client";

// Simple CSS-class-driven status badge used by StreamPanel — distinct from
// components/ui/StatusBadge.tsx (the richer five-variant badge used across
// the seeded dashboard/playbooks/session screens).
import type { SessionStatus } from "../types";

export function AgentStatusBadge({ status }: { status: SessionStatus }) {
  const className =
    status === "writing"
      ? "badge writing"
      : status === "error"
        ? "badge error"
        : "badge";
  return <span className={className}>Status: {status}</span>;
}
