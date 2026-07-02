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
