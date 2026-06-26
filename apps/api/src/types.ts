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

export interface SessionRecord {
  id: string;
  status: SessionStatus;
  input: SessionInput;
  output: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

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
