import { Worker } from "bullmq";
import { db } from "../db/client";
import { embedText } from "../rag/embed";
import { redisConnection } from "../redis/client";

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
      concurrency: 3,
    },
  );
}
