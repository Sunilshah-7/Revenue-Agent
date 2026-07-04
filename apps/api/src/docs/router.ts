// Gives @elysiajs/openapi something native to introspect for the six Hono
// product routes, which otherwise only exist behind the catch-all
// `.all("/*", ...)` in index.ts and are invisible to the plugin's route
// scan. Each route here carries zero Elysia-native body/response
// validators — only `detail`, which extends the OpenAPI Operation Object
// directly — because Elysia's own `t.Object(...)` body validator would
// consume the request stream before it reaches `api.fetch(request)`,
// breaking Hono's own zod validation downstream. The handler is a pure
// passthrough identical to the catch-all's; only routing granularity and
// OpenAPI visibility change, not behavior. Shapes mirror the API Contract
// documented in CLAUDE.md exactly.
import { Elysia } from "elysia";
import type { Hono } from "hono";
import type { OpenAPIV3 } from "openapi-types";

// Matches the SessionRecord shape in apps/api/src/types.ts and CLAUDE.md's
// API Contract exactly — reused across the three session endpoints below
// rather than repeated inline.
const sessionRecordSchema: OpenAPIV3.SchemaObject = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    status: {
      type: "string",
      enum: ["idle", "researching", "writing", "complete", "error"],
    },
    input: {
      type: "object",
      properties: {
        playbookId: { type: "string", format: "uuid" },
        prospectContext: { type: "string" },
      },
      required: ["prospectContext"],
    },
    output: { type: "string", nullable: true },
    error_message: { type: "string", nullable: true },
    created_at: { type: "string", format: "date-time" },
    updated_at: { type: "string", format: "date-time" },
  },
};

export function createDocsRouter(api: Hono) {
  const forward = ({ request }: { request: Request }) => api.fetch(request);

  return new Elysia()
    .post("/api/v1/documents", forward, {
      detail: {
        tags: ["Documents"],
        summary: "Upload and ingest a playbook document",
        description:
          "Extracts text from a PDF or TXT file, stores it, chunks it, and " +
          "queues one embed job per chunk on the `embed` BullMQ queue. " +
          "Responds once jobs are queued, not once embedding finishes — " +
          "`chunksQueued` reflects queued jobs, not completed embeddings.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: {
                    type: "string",
                    format: "binary",
                    description: "A .txt or .pdf playbook document.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Document stored and chunk embedding jobs queued.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    documentId: { type: "string", format: "uuid" },
                    chunksQueued: { type: "integer" },
                    status: { type: "string", enum: ["queued"] },
                  },
                },
              },
            },
          },
          "400": {
            description: "No file was included in the multipart body.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
          "500": {
            description:
              "Extraction failed, or the file type was neither PDF nor TXT.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
        },
      },
    })
    .get("/api/v1/documents", forward, {
      detail: {
        tags: ["Documents"],
        summary: "List indexed documents",
        description:
          "Live inventory ordered by most recently created, including " +
          "ingestion status and the actually-embedded chunk count so a " +
          "document that failed or is still processing is visibly " +
          "distinguishable from one that is fully searchable.",
        responses: {
          "200": {
            description: "Indexed documents.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    documents: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          filename: { type: "string" },
                          status: {
                            type: "string",
                            enum: ["processing", "ready", "failed"],
                          },
                          error_message: { type: "string", nullable: true },
                          chunk_count: { type: "integer" },
                          created_at: {
                            type: "string",
                            format: "date-time",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    .post("/api/v1/documents/:id/reembed", forward, {
      detail: {
        tags: ["Documents"],
        summary: "Re-run chunking and embedding for an existing document",
        description:
          "Deletes the document's existing chunks and re-chunks/re-embeds " +
          "its already-stored content from scratch (idempotent). Repairs a " +
          "document stuck in 'failed' or ingested before status tracking " +
          "existed, without needing to re-upload the original file.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Chunks cleared and re-embed jobs queued.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    documentId: { type: "string", format: "uuid" },
                    chunksQueued: { type: "integer" },
                    status: { type: "string", enum: ["processing", "failed"] },
                  },
                },
              },
            },
          },
          "400": {
            description: "The id path parameter was not a valid UUID.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
          "404": {
            description: "No document with that id.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
        },
      },
    })
    .get("/api/v1/sessions", forward, {
      detail: {
        tags: ["Sessions"],
        summary: "List recent agent sessions",
        description:
          "Most recent 50 sessions, newest first. Per CLAUDE.md, the " +
          "Dashboard's recents list does not call this endpoint yet.",
        responses: {
          "200": {
            description: "Recent sessions.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessions: {
                      type: "array",
                      items: sessionRecordSchema,
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    .post("/api/v1/sessions", forward, {
      detail: {
        tags: ["Sessions"],
        summary: "Start a new agent session",
        description:
          "Inserts the session as `idle`, then immediately calls " +
          "OrchestratorAgent.start(), which flips it to `researching` and " +
          "enqueues the research job. Connect to /ws/session/:id with the " +
          "returned sessionId to receive token/status/error/done events " +
          "as the run progresses.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["prospectContext"],
                properties: {
                  playbookId: { type: "string", format: "uuid" },
                  prospectContext: { type: "string", minLength: 1 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Session created and research enqueued.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    sessionId: { type: "string", format: "uuid" },
                    status: { type: "string", enum: ["researching"] },
                  },
                },
              },
            },
          },
          "400": {
            description: "prospectContext was missing or empty.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
        },
      },
    })
    .get("/api/v1/sessions/:id", forward, {
      detail: {
        tags: ["Sessions"],
        summary: "Get session status and output",
        description:
          "Persisted session state. Per CLAUDE.md, the Live Session " +
          "screen still animates seeded content instead of calling this " +
          "and the WS endpoint.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Session found.",
            content: {
              "application/json": { schema: sessionRecordSchema },
            },
          },
          "404": {
            description: "No session with that id.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
        },
      },
    })
    .post("/api/v1/query", forward, {
      detail: {
        tags: ["Query"],
        summary: "One-shot RAG query against playbooks",
        description:
          "Retrieves the topK nearest playbook chunks and answers from " +
          "them. If sessionId is set and playbookId is omitted, retrieval " +
          "is scoped to that session's original playbook. Set `stream: " +
          "true` in the body, or send `Accept: text/event-stream`, to " +
          "receive the answer as SSE frames (each `data:` line is a " +
          "SessionWsEvent — token/status/error/done) instead of a single " +
          "JSON response; if sessionId is set, the same tokens are also " +
          "republished on that session's WebSocket channel.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["query"],
                properties: {
                  query: { type: "string", minLength: 1 },
                  sessionId: { type: "string", format: "uuid" },
                  playbookId: { type: "string", format: "uuid" },
                  topK: { type: "integer", minimum: 1, maximum: 20 },
                  stream: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description:
              "JSON answer (default), or an SSE stream if `stream: true` " +
              "or `Accept: text/event-stream` was sent.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    answer: { type: "string" },
                    chunks: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          doc_id: { type: "string", format: "uuid" },
                          content: { type: "string" },
                          score: { type: "number" },
                          metadata: { type: "object" },
                        },
                      },
                    },
                  },
                },
              },
              "text/event-stream": {
                schema: {
                  type: "string",
                  description:
                    'One SessionWsEvent per "data:" frame, e.g. ' +
                    '`data: {"type":"token","data":"..."}`.',
                },
              },
            },
          },
          "400": {
            description: "query was missing/empty, or topK was out of range.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { error: { type: "string" } },
                },
              },
            },
          },
        },
      },
    })
    .get("/health", forward, {
      detail: {
        tags: ["Health"],
        summary: "Health check",
        description:
          "Operational endpoint for Railway health checks and local " +
          "sanity checks — not one of the six product REST endpoints.",
        responses: {
          "200": {
            description: "Process is up.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", enum: ["ok"] },
                    timestamp: { type: "string", format: "date-time" },
                  },
                },
              },
            },
          },
        },
      },
    });
}
