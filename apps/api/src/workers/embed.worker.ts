// Consumes one "embed" job per document chunk (fanned out by
// routes/documents.ts after upload+chunking) — embeds that chunk's text
// and persists it as a document_chunks row with its pgvector embedding.
// This is the ingest-time half of the RAG pipeline; rag/retrieve.ts is the
// query-time half reading from the same table.
import { Worker } from "bullmq";
import { db } from "../db/client";
import { embedText } from "../rag/embed";
import { redisConnection } from "../redis/client";

// Mirrors the EmbedJobData shape documented in CLAUDE.md's Data Models.
interface EmbedJobData {
  docId: string;
  filename: string;
  chunk: string;
  chunkIndex: number;
  pageHint: number | null;
}

export function startEmbedWorker(): Worker<EmbedJobData> {
  return new Worker<EmbedJobData>(
    "embed",
    async (job) => {
      const { docId, filename, chunk, chunkIndex, pageHint } = job.data;
      const [vector] = await embedText(chunk);
      const vectorLiteral = `[${vector.join(",")}]`;

      // metadata JSONB duplicates docId/filename/chunkIndex/pageHint
      // alongside the normalized columns — this denormalization lets
      // rag/retrieve.ts's SELECT return everything a caller needs (e.g.
      // QueryChunk.metadata in the API contract) without a join back to
      // `documents`.
      await db.query(
        `
          INSERT INTO document_chunks (doc_id, content, embedding, chunk_index, metadata)
          VALUES ($1, $2, $3::vector, $4, $5::jsonb)
        `,
        [
          docId,
          chunk,
          vectorLiteral,
          chunkIndex,
          JSON.stringify({ docId, filename, pageHint, chunkIndex }),
        ],
      );
    },
    {
      connection: redisConnection,
      // Low concurrency (3) since embedding + a single-row insert per job
      // is cheap; this just bounds how many chunks are processed in
      // parallel per worker instance.
      concurrency: 3,
    },
  );
}
