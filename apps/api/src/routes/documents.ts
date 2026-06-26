import { Hono } from "hono";
import pdfParse from "pdf-parse";
import { db } from "../db/client";
import { chunkText } from "../rag/chunk";
import { embedQueue } from "../workers/queue";

export const documentsRouter = new Hono();

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
