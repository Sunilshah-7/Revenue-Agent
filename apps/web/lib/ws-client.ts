import type { WsMessage } from "../types";

const wsBase = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

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
