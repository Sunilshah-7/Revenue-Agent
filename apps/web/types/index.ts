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

export interface RetrievalTraceChunk {
  doc_id: string;
  filename: string;
  chunk_index: number;
  score: number;
  preview: string;
}

export interface RetrievalTrace {
  query: string;
  topK: number;
  threshold: number;
  playbookId: string | null;
  totalCandidates: number;
  truncated: boolean;
  chunks: RetrievalTraceChunk[];
}

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  input: SessionInput;
  output: string | null;
  error_message: string | null;
  retrieval_trace: RetrievalTrace | null;
  created_at: string;
  updated_at: string;
}

export interface ListSessionsResponse {
  sessions: SessionRecord[];
}

export type DocumentStatus = "processing" | "ready" | "failed";

export interface DocumentRecord {
  id: string;
  filename: string;
  status: DocumentStatus;
  error_message: string | null;
  chunk_count: number;
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
