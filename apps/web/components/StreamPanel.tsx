"use client";

// The genuinely-wired real-time output panel: opens a real WebSocket via
// lib/ws-client.ts to /ws/session/:id and renders tokens as they arrive.
// Used by the real session-detail route (app/dashboard/[sessionId]/page.tsx),
// not by the documented-but-still-simulated "/session/[id]" screen.
import { useEffect, useMemo, useState } from "react";
import { connectSessionStream } from "../lib/ws-client";
import type { SessionStatus, WsMessage } from "../types";
import { AgentStatusBadge } from "./AgentStatusBadge";

export function StreamPanel({
  sessionId,
  initialOutput,
}: {
  sessionId: string;
  initialOutput?: string | null;
}) {
  const [status, setStatus] = useState<SessionStatus>("researching");
  const [output, setOutput] = useState(initialOutput ?? "");

  // Mirrors the four SessionWsEvent variants exactly: tokens append to the
  // running output, status/error/done update the badge state. The socket
  // is opened once per sessionId and explicitly closed on unmount/sessionId
  // change to avoid leaking connections across navigations.
  useEffect(() => {
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
          setOutput((prev) => `${prev}\n\n[Error] ${message.message}`);
          return;
        }

        if (message.type === "done") {
          setStatus("complete");
        }
      },
    });

    return () => {
      ws.close();
    };
  }, [sessionId]);

  const renderedOutput = useMemo(() => {
    if (output.trim().length > 0) {
      return output;
    }
    return "Waiting for first tokens from the backend...";
  }, [output]);

  return (
    <div className="card grid">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3 style={{ margin: 0 }}>Live Session Stream</h3>
        <AgentStatusBadge status={status} />
      </div>
      <pre className="stream">{renderedOutput}</pre>
    </div>
  );
}
