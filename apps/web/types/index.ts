// Frontend wire types (per the Key Files Map) — must stay aligned with the
// API Contract and with apps/api/src/types.ts on the backend. This is the
// set actually used by the real/wired frontend paths (lib/api.ts,
// lib/ws-client.ts, StreamPanel); the still-seeded pages define their own
// local fixture-shaped types instead of importing from here (e.g.
// dashboard/page.tsx's RecentSession, query/page.tsx's QueryMessage import
// is real, but its content is fixture data).
export type SessionStatus =
  | "idle"
  | "researching"
  | "writing"
  | "complete"
  | "error";

export interface SessionResponse {
  sessionId: string;
  status: SessionStatus;
}

export interface SessionDetail {
  id: string;
  status: SessionStatus;
  input: Record<string, unknown>;
  output: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export type WsMessage =
  | { type: "token"; data: string }
  | { type: "status"; state: SessionStatus }
  | { type: "error"; message: string }
  | { type: "done" };

export interface QuerySourceScore {
  score: number;
}

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: QuerySourceScore[];
  isLoading?: boolean;
}
