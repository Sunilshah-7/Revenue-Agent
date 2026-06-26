"use client";

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
