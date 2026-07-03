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
          "Live inventory ordered by most recently created. Per CLAUDE.md, " +
          "the Playbooks screen's grid does not call this endpoint yet.",
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
    });
}
