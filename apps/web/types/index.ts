// Frontend wire types — must stay aligned with apps/api/src/types.ts.
export type SessionStatus =
  | "idle"
  | "researching"
  | "writing"
  | "complete"
  | "error";

export interface SessionInput {
  playbookId?: string;
  prospectContext: string;
}

export interface SessionResponse {
  sessionId: string;
  status: SessionStatus;
}

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  input: SessionInput;
  output: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListSessionsResponse {
  sessions: SessionRecord[];
}

export interface DocumentRecord {
  id: string;
  filename: string;
  created_at: string;
}

export interface ListDocumentsResponse {
  documents: DocumentRecord[];
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
