-- Adds ingestion-status tracking to documents and retrieval observability
-- to sessions. Motivated by a diagnosed incident: a document could exist in
-- the documents table while being partially or fully unsearchable (e.g. an
-- upload that failed mid-ingestion), with nothing in the API surface to
-- distinguish that from a fully-indexed document.

-- `status` mirrors the ingestion lifecycle: 'processing' immediately after
-- upload, 'ready' once every chunk is chunked+embedded, 'failed' if any
-- chunk's embed job exhausts retries (or the document produced zero
-- chunks). `chunks_total` is the expected chunk count recorded at upload
-- time, used by the embed queue's completion handler to know when a
-- document has finished (see index.ts).
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS chunks_total INTEGER NOT NULL DEFAULT 0;

-- Backfill for documents ingested before this column existed: a document
-- with at least one embedded chunk was, in practice, successfully indexed
-- (chunks_total is unknown for these rows, so it's set to the actual
-- embedded count rather than left at 0, which would otherwise make it look
-- perpetually incomplete).
UPDATE documents d
SET status = 'ready',
    chunks_total = sub.embedded_count
FROM (
  SELECT doc_id, COUNT(*) AS embedded_count
  FROM document_chunks
  WHERE embedding IS NOT NULL
  GROUP BY doc_id
) sub
WHERE d.id = sub.doc_id
  AND d.status = 'processing';

-- Any remaining pre-existing document with zero embedded chunks predates
-- status tracking and cannot be trusted as searchable — flag it rather
-- than silently leaving it in 'processing' forever.
UPDATE documents d
SET status = 'failed',
    error_message = 'ingested before status tracking; re-embed required'
WHERE d.status = 'processing'
  AND NOT EXISTS (
    SELECT 1 FROM document_chunks c
    WHERE c.doc_id = d.id AND c.embedding IS NOT NULL
  );

-- Retrieval observability: what chunks were retrieved for a session's
-- research step, the query text/topK/threshold/filter that produced them,
-- and how many candidate chunks existed in the index at the time — lets
-- GET /api/v1/sessions/:id answer "what did the agent actually see?"
-- without re-running SQL by hand. JSONB on `sessions` (rather than a
-- separate session_retrievals table) because there is exactly one
-- retrieval per session today (research.worker.ts runs once per session)
-- and the trace is only ever read as a whole alongside the rest of the
-- session row — a join would add cost with no query pattern that needs it.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS retrieval_trace JSONB;
