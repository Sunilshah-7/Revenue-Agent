import { db } from "../db/client";
import { embedText } from "./embed";

export interface RetrievedChunk {
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export async function retrieveTopChunks(
  query: string,
  topK = 5,
): Promise<RetrievedChunk[]> {
  const [vector] = await embedText(query);
  const vectorLiteral = `[${vector.join(",")}]`;

  const result = await db.query<RetrievedChunk>(
    `
      SELECT
        content,
        1 - (embedding <=> $1::vector) AS score,
        metadata
      FROM document_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `,
    [vectorLiteral, topK],
  );

  return result.rows;
}
