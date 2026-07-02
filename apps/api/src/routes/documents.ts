// Implements POST/GET /api/v1/documents — playbook upload and inventory.
// Upload is synchronous through extraction+chunking+DB insert, then fans
// chunk embedding out asynchronously to the "embed" BullMQ queue; the
// caller gets a response as soon as jobs are queued, not once embedding
// finishes (chunksQueued reflects "queued", not "embedded").
import { Hono } from "hono";
import pdfParse from "pdf-parse";
import { db } from "../db/client";
import { chunkText } from "../rag/chunk";
import { embedQueue } from "../workers/queue";

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
    const chunks = chunkText(content, { size: 512, overlap: 64 });

    // One embed job per chunk, enqueued sequentially in a loop (not
    // Promise.all) — this keeps enqueue order stable and avoids bursting
    // Redis with many concurrent `add` calls for large documents.
    for (const chunk of chunks) {
      await embedQueue.add(
        "embed",
        {
          docId,
          filename: file.name,
          chunk: chunk.content,
          chunkIndex: chunk.index,
          pageHint: chunk.pageHint,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 500 },
          removeOnComplete: { age: 3600 },
          removeOnFail: false,
        },
      );
    }

    return c.json({
      documentId: docId,
      chunksQueued: chunks.length,
      status: "queued",
    });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      500,
    );
  }
});

// Live inventory list — per CLAUDE.md, the Playbooks screen's grid is
// currently still seeded client-side and not yet wired to this endpoint.
documentsRouter.get("/api/v1/documents", async (c) => {
  const result = await db.query(
    `
      SELECT id, filename, created_at
      FROM documents
      ORDER BY created_at DESC
    `,
  );

  return c.json({ documents: result.rows });
});
