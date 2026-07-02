// Final stage of the RAG read path: embeds the incoming query with the same
// local hashing embedder used at ingest time, then runs a pgvector
// nearest-neighbor search over document_chunks. Used by both the research
// worker and the /api/v1/query route.
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
  // pgvector accepts a bracketed comma-separated literal string for a
  // vector value in SQL — this builds that literal for the query embedding.
  const vectorLiteral = `[${vector.join(",")}]`;
  const params = documentId
    ? [vectorLiteral, topK, documentId]
    : [vectorLiteral, topK];

  // `<=>` is pgvector's cosine-distance operator (0 = identical direction,
  // 2 = opposite); `1 - distance` converts it to a similarity score in
  // roughly [-1, 1] so callers get a higher-is-better score. documentId is
  // optional playbook scoping — when provided, retrieval is restricted to
  // chunks from that one document; the WHERE clause is only interpolated
  // when documentId is present, but the value itself is still passed as a
  // bound parameter ($3), not string-interpolated, so this stays injection-safe.
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
