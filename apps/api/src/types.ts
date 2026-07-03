// Current shared API types, imported across routes/agents/workers/ws.
// Per the Key Files Map this is meant to migrate toward
// `src/types/*.types.ts`, but as of now it's the single source of truth for
// the backend's session and WebSocket-event shapes; these must stay in
// sync with the Data Models and API Contract documented in CLAUDE.md, and
// with apps/web/types/index.ts on the frontend side.
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

// Wire shape returned by GET /api/v1/sessions and GET /api/v1/sessions/:id
// — note the snake_case error_message/created_at/updated_at, which mirror
// the Postgres column names directly rather than being camelCased at the
// API boundary.
export interface SessionRecord {
  id: string;
  status: SessionStatus;
  input: SessionInput;
  output: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// The four possible messages sent over /ws/session/:id (and reused as SSE
// frames by the streaming /api/v1/query response).
export interface WsEventToken {
  type: "token";
  data: string;
}

export interface WsEventStatus {
  type: "status";
  state: SessionStatus;
}

export interface WsEventError {
  type: "error";
  message: string;
}

export interface WsEventDone {
  type: "done";
}

export type SessionWsEvent =
  | WsEventToken
  | WsEventStatus
  | WsEventError
  | WsEventDone;
