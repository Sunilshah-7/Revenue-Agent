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

// Recalibrated against a real measured score distribution across two
// full-length sample playbooks (SaaS and healthcare) and three prospect
// contexts — see Architecture.md's embedding-quality limitation note for
// the full numbers. The old 0.1 threshold only screened a flat noise floor
// and was measured against short, low-overlap fixture text; once real
// long-form playbooks are in the corpus, two on-topic-sounding but
// wrong-domain documents (both being "playbook"-shaped, with "pricing
// tiers" and "case studies") produce lexical hash overlap up to 0.371,
// while genuine same-playbook matches never scored below 0.4222 across
// every fixture tested. 0.40 sits in that gap. This is still a coarse
// guard, not a precision filter — retrieval_trace (see research.worker.ts)
// remains the actual diagnostic tool for judging match quality.
export const MIN_SIMILARITY_THRESHOLD = 0.4;

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
