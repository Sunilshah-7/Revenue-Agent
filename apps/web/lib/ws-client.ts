// Session WebSocket client (per the Key Files Map). Unlike lib/api.ts, this
// connects directly to the Railway/local backend's WS endpoint rather than
// through a Next.js proxy — Next.js API routes can't broker a persistent
// WebSocket, so NEXT_PUBLIC_WS_URL is genuinely browser-visible here.
import type { WsMessage } from "../types";

const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

// Thin wrapper around the native browser WebSocket: parses each incoming
// frame as JSON into a WsMessage and hands it to the caller's onMessage.
export function connectSessionStream(
  sessionId: string,
  handlers: {
    onMessage: (message: WsMessage) => void;
    onOpen?: () => void;
    onClose?: () => void;
  },
): WebSocket {
  const socket = new WebSocket(`${wsBase}/ws/session/${sessionId}`);

  socket.onopen = () => handlers.onOpen?.();
  socket.onclose = () => handlers.onClose?.();
  socket.onmessage = (event) => {
    try {
      const parsed = JSON.parse(String(event.data)) as WsMessage;
      handlers.onMessage(parsed);
    } catch {
      // Ignore malformed messages and keep the stream alive.
    }
  };

  return socket;
}
