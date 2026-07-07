"use client";

// Real-time output panel for the session detail page. Opens a WebSocket to
// /ws/session/:id only when the session hasn't already finished (a
// completed/errored session has nothing left to stream), renders tokens as
// they arrive, and reflects the real three-stage state machine
// (researching -> writing -> complete, or error) — not a fabricated
// multi-stage pipeline.
import { useEffect, useMemo, useState } from "react";
import { CheckCircle, Loader2 } from "lucide-react";
import { connectSessionStream } from "../lib/ws-client";
import { formatRelativeTime } from "../lib/format";
import type { SessionStatus, WsMessage } from "../types";
import { StreamedMarkdown } from "./StreamedMarkdown";
import { OutputTypeBadge } from "./ui/OutputTypeBadge";

const STAGES: { key: Extract<SessionStatus, "researching" | "writing" | "complete">; label: string }[] = [
  { key: "researching", label: "Researching" },
  { key: "writing", label: "Writing" },
  { key: "complete", label: "Complete" },
];

function stageIndexFor(status: SessionStatus): number {
  return STAGES.findIndex((stage) => stage.key === status);
}

function Stepper({ status }: { status: SessionStatus }) {
  const currentIndex = stageIndexFor(status);

  return (
    <div className="flex items-center gap-3">
      {STAGES.map((stage, index) => {
        const isComplete = status === "complete" || index < currentIndex;
        const isActive = !isComplete && index === currentIndex;

        return (
          <div key={stage.key} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                isComplete
                  ? "bg-green-active text-white"
                  : isActive
                    ? "bg-accent-primary text-white"
                    : "border-2 border-border-subtle bg-bg-elevated text-text-secondary"
              }`}
            >
              {isComplete ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : isActive ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : null}
            </span>
            <span
              className={`text-[13px] font-medium ${
                isComplete
                  ? "text-green-active"
                  : isActive
                    ? "text-accent-primary"
                    : "text-text-secondary"
              }`}
            >
              {stage.label}
            </span>
            {index < STAGES.length - 1 ? (
              <span className="h-px w-8 bg-border-subtle" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function StreamPanel({
  sessionId,
  initialStatus,
  initialOutput,
  initialErrorMessage,
  createdAt,
  updatedAt,
}: {
  sessionId: string;
  initialStatus: SessionStatus;
  initialOutput: string | null;
  initialErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}) {
  const [status, setStatus] = useState<SessionStatus>(initialStatus);
  const [output, setOutput] = useState(initialOutput ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialErrorMessage,
  );

  const isTerminal = initialStatus === "complete" || initialStatus === "error";

  useEffect(() => {
    if (isTerminal) {
      return;
    }

    const ws = connectSessionStream(sessionId, {
      onMessage(message: WsMessage) {
        if (message.type === "token") {
          setOutput((prev) => prev + message.data);
          return;
        }

        if (message.type === "status") {
          setStatus(message.state);
          return;
        }

        if (message.type === "error") {
          setStatus("error");
          setErrorMessage(message.message);
          return;
        }

        if (message.type === "done") {
          setStatus((prev) => (prev === "error" ? prev : "complete"));
        }
      },
    });

    return () => {
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const streaming = !isTerminal && status !== "complete" && status !== "error";

  const renderedOutput = useMemo(() => {
    if (output.trim().length > 0) {
      return <StreamedMarkdown content={output} showCursor={streaming} />;
    }
    return (
      <p className="text-text-secondary">
        Waiting for the first tokens from the backend...
      </p>
    );
  }, [output, streaming]);

  return (
    <div className="rounded-card border border-border-subtle bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
        <Stepper status={status} />
        <div className="flex items-center gap-3">
          {status === "complete" ? <OutputTypeBadge output={output} /> : null}
          <span className="font-mono text-[11px] text-text-secondary">
            {output.length.toLocaleString()} chars streamed
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-6 py-3 text-[11px] text-text-secondary">
        <span>Created {formatRelativeTime(createdAt)}</span>
        <span>Updated {formatRelativeTime(updatedAt)}</span>
      </div>

      {status === "error" && errorMessage ? (
        <div className="mx-6 mb-4 rounded-md border border-red-error/30 bg-red-error/10 px-3 py-2 text-xs text-red-error">
          {errorMessage}
        </div>
      ) : null}

      <div className="px-6 pb-6 font-mono text-[13px] leading-relaxed">
        {renderedOutput}
      </div>
    </div>
  );
}
