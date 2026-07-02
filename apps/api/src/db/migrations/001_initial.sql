-- Sole schema migration for the app. All three product tables plus the
-- pgvector extension and its HNSW similarity index are created here; there
-- is no migration runner beyond `db:migrate:local` piping this file into
-- psql (see package.json / README for hosted Neon migration steps).

-- pgvector adds the `vector` column type and the vector_cosine_ops operator
-- class used by the HNSW index below.
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per uploaded playbook document. `content` holds the full
-- extracted text; chunking/embedding happens downstream in document_chunks.
CREATE TABLE IF NOT EXISTS documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename   TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 512-word/64-word-overlap chunks (see rag/chunk.ts) of a document, each
-- with its own 768-dimension embedding vector for retrieval. ON DELETE
-- CASCADE means deleting a document also deletes its chunks in one step.
CREATE TABLE IF NOT EXISTS document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(768),
  chunk_index INTEGER NOT NULL,
  metadata    JSONB DEFAULT '{}'
);

-- HNSW (Hierarchical Navigable Small World) is an approximate-nearest-
-- neighbor index; vector_cosine_ops matches the cosine-distance retrieval
-- query in rag/retrieve.ts. Per the Known Constraints, building/maintaining
-- this index gets expensive as document_chunks grows, so bulk ingestion
-- needs to account for that.
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);

-- One row per revenue-agent run. `status` mirrors the SessionStatus union
-- in types.ts ("idle" | "researching" | "writing" | "complete" | "error");
-- `input` stores the original CreateSessionRequest JSON so the pipeline can
-- be replayed/inspected, and `output` is only populated once the writer
-- worker finishes.
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT NOT NULL DEFAULT 'idle',
  input         JSONB NOT NULL,
  output        TEXT,
  error_message TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
