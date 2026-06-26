import { db } from "../db/client";
import { embedText } from "./embed";

export interface RetrievedChunk {
  doc_id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export async function retrieveTopChunks(
  query: string,
  topK = 5,
  documentId?: string,
): Promise<RetrievedChunk[]> {
  const [vector] = await embedText(query);
  const vectorLiteral = `[${vector.join(",")}]`;
  const params = documentId
    ? [vectorLiteral, topK, documentId]
    : [vectorLiteral, topK];

  const result = await db.query<RetrievedChunk>(
    `
      SELECT
        doc_id,
        content,
        1 - (embedding <=> $1::vector) AS score,
        metadata
      FROM document_chunks
      ${documentId ? "WHERE doc_id = $3" : ""}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `,
    params,
  );

  return result.rows;
}
