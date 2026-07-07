// Implements POST /api/v1/query — the one-shot RAG endpoint backing the
// Query screen. Supports both a plain JSON response and an SSE streaming
// response (the same one used for real Live Session output), and can
// optionally attach its output to an existing session's WS channel.
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/client";
import { createCompletion, streamCompletion } from "../lib/groq";
import { assembleContext } from "../rag/context";
import { retrieveTopChunks } from "../rag/retrieve";
import type { SessionWsEvent } from "../types";
import { publishSessionEvent } from "../ws/session";

const querySchema = z.object({
  query: z.string().min(1),
  sessionId: z.string().optional(),
  playbookId: z.string().optional(),
  topK: z.number().int().positive().max(20).optional(),
  stream: z.boolean().optional(),
});

export const queryRouter = new Hono();

type QueryMessage = Parameters<typeof createCompletion>[0][number];

function buildQueryMessages(query: string, context: string): QueryMessage[] {
  return [
    {
      role: "system",
      content:
        "Answer using only the provided context. If context is insufficient, state that clearly.",
    },
    {
      role: "user",
      content: `Query:\n${query}\n\nContext:\n${context}`,
    },
  ];
}

// Falls back to the playbook the given session was originally started
// with, so a query attached to a session (sessionId set, no explicit
// playbookId) automatically scopes retrieval to that session's playbook
// instead of searching every indexed document.
async function resolvePlaybookId(
  sessionId?: string,
  explicitPlaybookId?: string,
): Promise<string | undefined> {
  if (explicitPlaybookId) {
    return explicitPlaybookId;
  }

  if (!sessionId) {
    return undefined;
  }

  const result = await db.query<{ input: unknown }>(
    `
      SELECT input
      FROM sessions
      WHERE id = $1
      LIMIT 1
    `,
    [sessionId],
  );

  const input = result.rows[0]?.input;
  if (!input) {
    return undefined;
  }

  // The pg driver may return JSONB either already-parsed or as a raw
  // string depending on column typing/driver config, so both are handled
  // defensively here.
  const parsed =
    typeof input === "string" ? (JSON.parse(input) as unknown) : input;

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "playbookId" in parsed &&
    typeof parsed.playbookId === "string"
  ) {
    return parsed.playbookId;
  }

  return undefined;
}

// Builds a raw text/event-stream Response by hand-writing SSE "data:"
// frames from a Web Streams ReadableStream — no SSE library, just the
// standard fetch Response body contract that both browsers and the Next.js
// proxy can consume directly.
function streamQueryResponse(
  messages: QueryMessage[],
  sessionId?: string,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      };

      try {
        for await (const token of streamCompletion(messages)) {
          const event: SessionWsEvent = { type: "token", data: token };
          send(event);

          // When a sessionId is attached, the same token is also republished
          // on that session's Redis channel — so a query issued against an
          // active session shows up in that session's WebSocket clients too,
          // not just in this HTTP response.
          if (sessionId) {
            await publishSessionEvent(sessionId, event);
          }
        }

        const doneEvent: SessionWsEvent = { type: "done" };
        send(doneEvent);
        if (sessionId) {
          await publishSessionEvent(sessionId, doneEvent);
        }
      } catch (error) {
        const errorEvent: SessionWsEvent = {
          type: "error",
          message:
            error instanceof Error ? error.message : "Query streaming failed",
        };
        send(errorEvent);

        if (sessionId) {
          await publishSessionEvent(sessionId, errorEvent);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disables proxy buffering (e.g. nginx) that would otherwise batch
      // SSE frames and defeat token-by-token streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

queryRouter.post("/api/v1/query", async (c) => {
  try {
    const body = await c.req.json();
    const { query, sessionId, playbookId, topK, stream } =
      querySchema.parse(body);
    const scopedPlaybookId = await resolvePlaybookId(sessionId, playbookId);

    const retrieved = await retrieveTopChunks(query, topK ?? 5, scopedPlaybookId);
    // Deduped and word-budget-capped the same way research.worker.ts
    // assembles context — `chunks` in the response reflects what the
    // answer was actually grounded in, not the pre-cap retrieval set.
    const { context, usedChunks } = assembleContext(retrieved);

    const messages = buildQueryMessages(query, context);
    // SSE mode can be requested either explicitly (`stream: true` in the
    // body) or implicitly via an `Accept: text/event-stream` header — this
    // matches the API Contract's documented trigger for streaming.
    const acceptsSse = c.req.header("accept")?.includes("text/event-stream");

    if (stream || acceptsSse) {
      return streamQueryResponse(messages, sessionId);
    }

    const answer = await createCompletion(messages);

    return c.json({ answer, chunks: usedChunks });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      400,
    );
  }
});
