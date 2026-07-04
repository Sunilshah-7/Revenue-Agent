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

// Coarse noise guard, not a precision filter: rag/embed.ts is a lexical
// hashing embedder (shared word/bigram hash-bucket overlap), not a learned
// semantic embedding, so its cosine scores don't cleanly separate
// "relevant" from "irrelevant" — an unrelated query can still score ~0.1-0.14
// purely from hash collisions (measured locally), while a weakly-related
// but genuinely on-topic chunk can score ~0.18. This threshold only screens
// out the near-zero/negative noise floor; retrieval_trace (see
// research.worker.ts) is the actual diagnostic tool for judging match
// quality, per Architecture.md's embedding-quality limitation note.
export const MIN_SIMILARITY_THRESHOLD = 0.1;

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

  return result.rows.filter((row) => row.score >= MIN_SIMILARITY_THRESHOLD);
}

// Total chunks a retrieval call could have drawn from, for the
// retrieval_trace's "candidates considered" field — lets a later reader
// tell "only 2 chunks existed in the whole index" apart from "500 chunks
// existed and none scored above threshold".
export async function countIndexedChunks(documentId?: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `
      SELECT COUNT(*) FROM document_chunks
      ${documentId ? "WHERE doc_id = $1" : ""}
    `,
    documentId ? [documentId] : [],
  );

  return Number(result.rows[0].count);
}
