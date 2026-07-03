// The bridge between Redis pub/sub and connected browser WebSockets. Events
// published anywhere in the process (workers, routes) via
// publishSessionEvent land on a per-session Redis channel; this module
// subscribes to all of them with one pattern subscription and fans each
// message out to whichever local sockets are registered for that session.
// Using Redis as the transport (rather than calling socket.send directly
// from the workers) means workers don't need to know anything about
// WebSocket connections, and this would also work unchanged if
// workers/API ran as separate processes.
import { redisPublisher, redisSubscriber } from "../redis/client";
import { logger } from "../lib/logger";
import type { SessionStatus, SessionWsEvent } from "../types";

type SessionSocket = {
  send: (data: string) => void;
};

// In-memory only — sessionId -> set of live sockets for that session, all
// within this one process. A multi-instance deployment would need each
// instance to maintain its own map, which this Redis-fan-out design
// already supports (every instance would receive every session's
// messages via psubscribe, they'd just only forward to sockets they hold).
const sessionSockets = new Map<string, Set<SessionSocket>>();
let bridgeInitialized = false;
const BRIDGE_STARTUP_TIMEOUT_MS = 15_000;

// Redis channel names are "session:<id>"; this extracts the id back out of
// an incoming pmessage's channel.
function parseSessionId(channel: string): string | null {
  const parts = channel.split(":");
  if (parts.length !== 2 || parts[0] !== "session") {
    return null;
  }
  return parts[1];
}

// Called once at process startup (see index.ts). Idempotent via
// bridgeInitialized so re-invocation is a no-op.
export async function initializeSessionEventBridge(): Promise<void> {
  if (bridgeInitialized) {
    return;
  }

  logger.info("Initializing WebSocket Redis event bridge");

  // psubscribe (pattern subscribe) to "session:*" rather than subscribing
  // to each session individually — one subscription covers every current
  // and future session channel. Raced against a timeout so a misconfigured
  // Redis connection fails fast at boot with an actionable error instead of
  // hanging indefinitely.
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
      // No browser currently connected for this session — the message is
      // simply dropped (no replay/buffering), so a client that connects
      // late misses earlier tokens and must fall back to
      // GET /api/v1/sessions/:id for persisted state.
      return;
    }

    for (const socket of sockets) {
      socket.send(message);
    }
  });

  bridgeInitialized = true;
  logger.info("WebSocket event bridge initialized");
}

// Called from Elysia's ws `open` handler in index.ts.
export function registerSessionSocket(
  sessionId: string,
  socket: SessionSocket,
): void {
  if (!sessionSockets.has(sessionId)) {
    sessionSockets.set(sessionId, new Set());
  }

  sessionSockets.get(sessionId)?.add(socket);
}

// Called from Elysia's ws `close` handler; prunes the session's entry
// entirely once its last socket disconnects, so sessionSockets doesn't grow
// unbounded across the app's lifetime.
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

// Publish-side counterpart to the pmessage handler above — this is the
// single function every worker/route calls to emit a SessionWsEvent; it
// never touches sockets directly, only Redis.
export async function publishSessionEvent(
  sessionId: string,
  event: SessionWsEvent,
): Promise<void> {
  await redisPublisher.publish(`session:${sessionId}`, JSON.stringify(event));
}

// Convenience wrapper for the common case of publishing just a status
// transition (used at nearly every stage boundary in the orchestrator and
// workers).
export async function publishSessionStatus(
  sessionId: string,
  status: SessionStatus,
): Promise<void> {
  await publishSessionEvent(sessionId, { type: "status", state: status });
}
