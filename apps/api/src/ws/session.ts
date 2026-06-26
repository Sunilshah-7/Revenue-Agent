import { redisPublisher, redisSubscriber } from "../redis/client";
import { logger } from "../lib/logger";
import type { SessionStatus, SessionWsEvent } from "../types";

type SessionSocket = {
  send: (data: string) => void;
};

const sessionSockets = new Map<string, Set<SessionSocket>>();
let bridgeInitialized = false;
const BRIDGE_STARTUP_TIMEOUT_MS = 15_000;

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

  logger.info("Initializing WebSocket Redis event bridge");

  await Promise.race([
    redisSubscriber.psubscribe("session:*"),
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            "Timed out connecting to Redis pub/sub. Check REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, and REDIS_TLS.",
          ),
        );
      }, BRIDGE_STARTUP_TIMEOUT_MS);
    }),
  ]);

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
