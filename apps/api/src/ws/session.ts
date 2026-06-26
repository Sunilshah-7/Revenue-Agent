import { redisPublisher, redisSubscriber } from "../redis/client";
import { logger } from "../lib/logger";
import type { SessionStatus, SessionWsEvent } from "../types";

type SessionSocket = {
  send: (data: string) => void;
};

const sessionSockets = new Map<string, Set<SessionSocket>>();
let bridgeInitialized = false;

function parseSessionId(channel: string): string | null {
  const parts = channel.split(":");
  if (parts.length !== 2 || parts[0] !== "session") {
    return null;
  }
  return parts[1];
}

export async function initializeSessionEventBridge(): Promise<void> {
  if (bridgeInitialized) {
    return;
  }

  await redisSubscriber.psubscribe("session:*");

  redisSubscriber.on("pmessage", (_pattern, channel, message) => {
    const sessionId = parseSessionId(channel);
    if (!sessionId) {
      return;
    }

    const sockets = sessionSockets.get(sessionId);
    if (!sockets?.size) {
      return;
    }

    for (const socket of sockets) {
      socket.send(message);
    }
  });

  bridgeInitialized = true;
  logger.info("WebSocket event bridge initialized");
}

export function registerSessionSocket(
  sessionId: string,
  socket: SessionSocket,
): void {
  if (!sessionSockets.has(sessionId)) {
    sessionSockets.set(sessionId, new Set());
  }

  sessionSockets.get(sessionId)?.add(socket);
}

export function unregisterSessionSocket(
  sessionId: string,
  socket: SessionSocket,
): void {
  const sockets = sessionSockets.get(sessionId);
  if (!sockets) {
    return;
  }

  sockets.delete(socket);
  if (sockets.size === 0) {
    sessionSockets.delete(sessionId);
  }
}

export async function publishSessionEvent(
  sessionId: string,
  event: SessionWsEvent,
): Promise<void> {
  await redisPublisher.publish(`session:${sessionId}`, JSON.stringify(event));
}

export async function publishSessionStatus(
  sessionId: string,
  status: SessionStatus,
): Promise<void> {
  await publishSessionEvent(sessionId, { type: "status", state: status });
}

export async function streamTextAsTokens(
  sessionId: string,
  text: string,
): Promise<void> {
  const tokens = text.split(/(\s+)/).filter((token) => token.length > 0);
  for (const token of tokens) {
    await publishSessionEvent(sessionId, { type: "token", data: token });
  }
}
