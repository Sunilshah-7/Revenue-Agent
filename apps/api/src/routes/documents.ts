// Implements POST/GET /api/v1/documents — playbook upload and inventory.
// Upload is synchronous through extraction+chunking+DB insert, then fans
// chunk embedding out asynchronously to the "embed" BullMQ queue; the
// caller gets a response as soon as jobs are queued, not once embedding
// finishes (chunksQueued reflects "queued", not "embedded").
import { Hono } from "hono";
import pdfParse from "pdf-parse";
import { z } from "zod";
import { db } from "../db/client";
import { chunkText } from "../rag/chunk";
import { EMBED_JOB_OPTIONS, embedQueue } from "../workers/queue";

export const documentsRouter = new Hono();

// Only plain text and PDF are supported; anything else throws, which the
// POST handler below turns into a 500 with the error message.
async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === "text/plain" || file.name.endsWith(".txt")) {
    return file.text();
  }

  if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await pdfParse(bytes);
    return parsed.text;
  }

  throw new Error("Unsupported file type. Use PDF or TXT.");
}

// Shared by the initial upload and /reembed: chunks `content`, records the
// resulting chunk count/status on the document row, and enqueues one embed
// job per chunk. Zero chunks (empty content) is marked 'failed' immediately
// rather than left in 'processing' with no embed job ever coming to
// complete it.
async function chunkAndEnqueueEmbeds(
  docId: string,
  filename: string,
  content: string,
): Promise<{ chunksQueued: number; status: "processing" | "failed" }> {
  const chunks = chunkText(content, { size: 512, overlap: 64 });
  const status = chunks.length === 0 ? "failed" : "processing";

  await db.query(
    `
      UPDATE documents
      SET status = $2, error_message = $3, chunks_total = $4
      WHERE id = $1
    `,
    [
      docId,
      status,
      chunks.length === 0 ? "document produced no chunks to embed" : null,
      chunks.length,
    ],
  );

  // One embed job per chunk, enqueued sequentially in a loop (not
  // Promise.all) — this keeps enqueue order stable and avoids bursting
  // Redis with many concurrent `add` calls for large documents.
  for (const chunk of chunks) {
    await embedQueue.add(
      "embed",
      {
        docId,
        filename,
        chunk: chunk.content,
        chunkIndex: chunk.index,
        pageHint: chunk.pageHint,
      },
      EMBED_JOB_OPTIONS,
    );
  }

  return { chunksQueued: chunks.length, status };
}

documentsRouter.post("/api/v1/documents", async (c) => {
  try {
    const body = await c.req.formData();
    const file = body.get("file");

    if (!(file instanceof File)) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    const content = await extractTextFromFile(file);

    const documentInsert = await db.query<{ id: string }>(
      `
        INSERT INTO documents (filename, content)
        VALUES ($1, $2)
        RETURNING id
      `,
      [file.name, content],
    );

    const docId = documentInsert.rows[0].id;
    const { chunksQueued } = await chunkAndEnqueueEmbeds(
      docId,
      file.name,
      content,
    );

    return c.json({
      documentId: docId,
      chunksQueued,
      status: "queued",
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      500,
    );
  }
});

// Live inventory list, now including ingestion status and the actually-
// embedded chunk count (not just chunks_total, which is what was expected
// at upload time) so a document that "exists" but is unsearchable is
// visibly broken rather than silently present.
documentsRouter.get("/api/v1/documents", async (c) => {
  const result = await db.query(
    `
      SELECT
        d.id,
        d.filename,
        d.status,
        d.error_message,
        COUNT(c.id) FILTER (WHERE c.embedding IS NOT NULL)::int AS chunk_count,
        d.created_at
      FROM documents d
      LEFT JOIN document_chunks c ON c.doc_id = d.id
      GROUP BY d.id
      ORDER BY d.created_at DESC
    `,
  );

  return c.json({ documents: result.rows });
});

const chunksParamsSchema = z.object({ id: z.string().uuid() });

// Per-document chunk inspection — chunk_count on GET /api/v1/documents only
// says how many chunks embedded, not what's actually in them. This exposes
// the same document_chunks rows a debugging psql session would show, minus
// the 768-dimension embedding vector itself (not useful to a caller, and
// large enough per row to bloat the response for no reason); `embedded`
// stands in for "is embedding IS NOT NULL" instead.
documentsRouter.get("/api/v1/documents/:id/chunks", async (c) => {
  let id: string;
  try {
    ({ id } = chunksParamsSchema.parse({ id: c.req.param("id") }));
  } catch {
    return c.json({ error: "Invalid document id" }, 400);
  }

  const docResult = await db.query(`SELECT id FROM documents WHERE id = $1`, [
    id,
  ]);

  if (docResult.rows.length === 0) {
    return c.json({ error: "Document not found" }, 404);
  }

  const chunksResult = await db.query(
    `
      SELECT
        id,
        chunk_index,
        content,
        metadata,
        (embedding IS NOT NULL) AS embedded
      FROM document_chunks
      WHERE doc_id = $1
      ORDER BY chunk_index
    `,
    [id],
  );

  return c.json({ documentId: id, chunks: chunksResult.rows });
});

const reembedParamsSchema = z.object({ id: z.string().uuid() });

// Repairs a document that predates ingestion-status tracking, or one that
// legitimately failed, without requiring the original file to be
// re-uploaded — the document's stored `content` is already the full
// extracted text. Idempotent: existing chunks are deleted first, so
// calling this twice in a row (or on an already-'ready' document) just
// re-derives the same chunks from the same content.
const deleteParamsSchema = z.object({ id: z.string().uuid() });

// Removes a document and its chunks entirely (document_chunks.doc_id has
// ON DELETE CASCADE, so one statement clears both) — the roadmap "document
// management: delete" item, and the only way to remove a document ingested
// by mistake or during test/debugging without a DB shell.
documentsRouter.delete("/api/v1/documents/:id", async (c) => {
  let id: string;
  try {
    ({ id } = deleteParamsSchema.parse({ id: c.req.param("id") }));
  } catch {
    return c.json({ error: "Invalid document id" }, 400);
  }

  const result = await db.query(`DELETE FROM documents WHERE id = $1`, [id]);

  if (result.rowCount === 0) {
    return c.json({ error: "Document not found" }, 404);
  }

  return c.json({ documentId: id, deleted: true });
});

documentsRouter.post("/api/v1/documents/:id/reembed", async (c) => {
  let id: string;
  try {
    ({ id } = reembedParamsSchema.parse({ id: c.req.param("id") }));
  } catch {
    return c.json({ error: "Invalid document id" }, 400);
  }

  const docResult = await db.query<{ id: string; filename: string; content: string }>(
    `SELECT id, filename, content FROM documents WHERE id = $1`,
    [id],
  );

  if (docResult.rows.length === 0) {
    return c.json({ error: "Document not found" }, 404);
  }

  const doc = docResult.rows[0];

  try {
    await db.query(`DELETE FROM document_chunks WHERE doc_id = $1`, [id]);
    const { chunksQueued, status } = await chunkAndEnqueueEmbeds(
      id,
      doc.filename,
      doc.content,
    );

    return c.json({ documentId: id, chunksQueued, status });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Re-embed failed" },
      500,
    );
  }
});
