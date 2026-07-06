# Architecture — AI Revenue Agent Platform

## Table of Contents

- [Architecture — AI Revenue Agent Platform](#architecture--ai-revenue-agent-platform)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [System Topology](#system-topology)
  - [Component Breakdown](#component-breakdown)
    - [Frontend — Vercel / Next.js](#frontend--vercel--nextjs)
    - [Backend — Railway / Bun](#backend--railway--bun)
  - [Data Flow](#data-flow)
    - [1. Document Ingestion (Playbook Upload)](#1-document-ingestion-playbook-upload)
    - [2. Agent Session (Research → Write)](#2-agent-session-research--write)
    - [3. Direct RAG Query](#3-direct-rag-query)
  - [RAG Pipeline](#rag-pipeline)
  - [Agent Orchestration](#agent-orchestration)
  - [WebSocket Streaming](#websocket-streaming)
  - [Job Queue Architecture](#job-queue-architecture)
  - [Database Schema](#database-schema)
  - [Deployment Architecture](#deployment-architecture)
  - [Environment Configuration](#environment-configuration)
  - [Key Design Decisions](#key-design-decisions)

---

## Overview

The AI Revenue Agent Platform is a full-stack system that automates revenue research, buyer engagement, and business-case generation. It is built around a **single orchestrator agent** that coordinates specialized sub-agents through a job queue, streams results over WebSockets, and answers queries using a RAG pipeline grounded in internal sales playbooks.

The architecture is split into two independently deployed services:

- **Frontend** — Next.js `app/` router, deployed to Vercel
- **Backend** — Hono + Elysia on Bun, deployed to Railway

Both services share managed cloud data stores (Neon, Upstash), call Groq's inference API for LLM completions, and generate local deterministic embeddings for the demo RAG index.

---

## System Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                    Next.js — Vercel (CDN)                       │
│                                                                 │
│  ┌─────────────────┐          ┌──────────────────────────────┐  │
│  │   React UI      │◄────────►│  Next.js API Routes          │  │
│  │  (app/ router)  │  fetch   │  /api/documents              │  │
│  └────────┬────────┘          │  /api/sessions               │  │
│           │ WebSocket          └──────────────────────────────┘  │
└───────────┼─────────────────────────────────────────────────────┘
            │ wss://
            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   BACKEND SERVICE — Railway                     │
│                    Bun runtime · Hono · Elysia                  │
│                                                                 │
│  ┌──────────────┐   ┌───────────────┐   ┌──────────────────┐   │
│  │  Hono Router │   │ Elysia WS     │   │  Orchestrator    │   │
│  │  REST API    │──►│ Streaming     │──►│  Agent           │   │
│  │  /api/v1/    │   │ /ws/session   │   │  (TypeScript)    │   │
│  └──────────────┘   └───────────────┘   └────────┬─────────┘   │
│                                                   │             │
│                          ┌────────────────────────┘             │
│                          ▼                                      │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                   BullMQ Workers                       │     │
│  │                                                        │     │
│  │  ┌─────────────┐  ┌────────────────┐  ┌────────────┐  │     │
│  │  │  Research   │  │  RAG / Embed   │  │  Writer    │  │     │
│  │  │  Worker     │  │  Worker        │  │  Worker    │  │     │
│  │  └─────────────┘  └────────────────┘  └────────────┘  │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────┬──────────────────┬──────────────────┬─────────┘
                  │                  │                  │
        ┌─────────▼──────┐  ┌────────▼───────┐  ┌──────▼───────┐
        │  Neon Postgres  │  │ Upstash Redis  │  │  Groq API    │
        │  + pgvector     │  │ (BullMQ queue) │  │  LLM + Embed │
        └────────────────┘  └────────────────┘  └──────────────┘
```

---

## Component Breakdown

### Frontend — Vercel / Next.js

```
apps/web/
├── app/
│   ├── layout.tsx              # Root layout, font loading
│   ├── page.tsx                # Landing / session entry
│   ├── dashboard/
│   │   ├── page.tsx            # Agent session dashboard
│   │   └── [sessionId]/
│   │       └── page.tsx        # Live session view with WS stream
│   ├── playbooks/
│   │   └── page.tsx            # Upload & manage sales playbooks
│   └── api/
│       ├── documents/route.ts  # Proxy to backend document ingestion
│       └── sessions/route.ts   # Create / list agent sessions
├── components/
│   ├── StreamPanel.tsx         # WebSocket-connected output panel
│   ├── PlaybookUploader.tsx    # Drag-and-drop doc uploader
│   └── AgentStatusBadge.tsx    # Real-time agent state indicator
├── lib/
│   ├── ws-client.ts            # WebSocket client singleton
│   └── api.ts                  # Typed fetch wrappers
└── types/
    └── index.ts                # Shared TypeScript types
```

**Key choices:**

- `app/` router with React Server Components for playbook listing and session history
- Client components only where interactivity or WebSocket access is needed
- No state management library — React `useState` / `useReducer` for local state, URL params for shareable session links

---

### Backend — Railway / Bun

```
apps/api/
├── src/
│   ├── index.ts                # Bun entry — mounts Hono + Elysia
│   ├── routes/
│   │   ├── documents.ts        # POST /api/v1/documents (ingest + embed)
│   │   ├── sessions.ts         # GET/POST /api/v1/sessions, GET /:id
│   │   ├── query.ts            # POST /api/v1/query (RAG query)
│   │   └── health.ts           # GET /health
│   ├── ws/
│   │   └── session.ts          # Elysia WebSocket handler /ws/session/:id
│   ├── agents/
│   │   ├── orchestrator.ts     # OrchestratorAgent — dispatches sub-tasks
│   │   ├── researcher.ts       # ResearchAgent — retrieves + synthesizes
│   │   └── writer.ts           # WriterAgent — generates business case text
│   ├── workers/
│   │   ├── queue.ts            # BullMQ Queue + Worker definitions
│   │   ├── embed.worker.ts     # Chunk text → embed → upsert to pgvector
│   │   ├── research.worker.ts  # RAG retrieval + Groq completion
│   │   └── writer.worker.ts    # Business case generation
│   ├── rag/
│   │   ├── embed.ts            # Local deterministic 768-dim embeddings
│   │   ├── retrieve.ts         # pgvector similarity search
│   │   └── chunk.ts            # Text chunking (fixed-size + overlap)
│   ├── db/
│   │   ├── client.ts           # postgres (node-postgres) client
│   │   ├── schema.ts           # Table definitions as TypeScript constants
│   │   └── migrations/         # SQL migration files
│   ├── redis/
│   │   └── client.ts           # ioredis client for BullMQ
│   └── lib/
│       ├── groq.ts             # Groq SDK wrapper (chat + embed)
│       └── logger.ts           # Structured console logger
└── bun.lockb
```

---

## Data Flow

### 1. Document Ingestion (Playbook Upload)

```
User uploads PDF/TXT
        │
        ▼
Next.js API route /api/documents
        │ POST multipart
        ▼
Hono /api/v1/documents
        │
        ├── Parse file content
        ├── Split into chunks (512 tokens, 64 overlap)
        ├── INSERT INTO documents (status='processing', chunks_total=N)
        ├── Enqueue embed jobs → BullMQ "embed" queue
        └── Return { documentId, chunksQueued, status: "queued" }

BullMQ embed.worker
        │
        ├── Generate local 768-dim embeddings
        ├── Receive float[] vector (768 dims)
        └── INSERT INTO document_chunks (content, embedding, metadata)
            using pgvector

embedQueueEvents (index.ts)
        │
        ├── "completed" → documents.status='ready' once every chunk in
        │   chunks_total has an embedded row (order-independent: checked
        │   as a count comparison, not "last job wins")
        └── "failed"    → documents.status='failed', error_message=reason,
            once a chunk's embed job exhausts its retries
```

A document that produces zero chunks (empty file) is marked `failed`
immediately in the same request, since it will never receive an embed job
to complete it. `POST /api/v1/documents/:id/reembed` repairs a `failed`
document (or one ingested before `status` existed) by deleting its chunks
and re-running chunking/embedding against its already-stored `content` —
no re-upload needed. See [Document Ingestion Status](README.md#document-ingestion-status)
in the README for the full status lifecycle and the endpoint's request/response
shape.

### 2. Agent Session (Research → Write)

```
User triggers "Run Agent" in dashboard
        │
        ▼
POST /api/v1/sessions { prospectContext, playbookId? }
        │
        ▼
OrchestratorAgent.start()
        │
        ├── Enqueue "research" job → BullMQ
        ├── Open WebSocket session channel
        └── Return { sessionId }

BullMQ research.worker
        │
        ├── RAG retrieval: embed(prospectContext) → pgvector similarity search,
        │   filtered by MIN_SIMILARITY_THRESHOLD and optional playbookId
        ├── Fetch top-k chunks from document_chunks
        ├── Assemble context: dedupe + cap to a word budget (rag/context.ts)
        ├── UPDATE sessions SET retrieval_trace = {...} — see
        │   [Retrieval Trace](README.md#retrieval-trace) in the README
        ├── Call Groq (llama-3.3-70b) with retrieved context (or an explicit
        │   "no playbook context found" note if nothing cleared the threshold)
        ├── Emit streaming tokens → Redis pub/sub → Elysia WS → client
        └── On complete → enqueue "writer" job

BullMQ writer.worker
        │
        ├── Receive research summary
        ├── Call Groq to generate business case
        ├── Emit final output → WebSocket
        └── UPDATE sessions SET status="complete", output=...
```

### 3. Direct RAG Query

```
User types query in dashboard
        │
        ▼
POST /api/v1/query { query, sessionId }
        │
        ├── Embed query → vector
        ├── pgvector similarity search (cosine, top 5)
        ├── Construct prompt with retrieved chunks
        ├── Groq streaming completion
        └── Stream tokens back via SSE / WebSocket
```

---

## RAG Pipeline

The RAG pipeline is intentionally simple and auditable — no LangChain abstraction, just typed TypeScript functions.

```
Document
   │
   ▼
chunk(text, { size: 512, overlap: 64 })
   │ string[]
   ▼
embed(chunks[]) → local deterministic 768-dim vectors
   │ number[][] (768-dim vectors)
   ▼
pgvector INSERT
   document_chunks(id, doc_id, content, embedding vector(768), chunk_index, metadata)

Query
   │
   ▼
embed(query) → vector
   │
   ▼
SELECT content, 1 - (embedding <=> $queryVec) AS score
FROM document_chunks
ORDER BY embedding <=> $queryVec
LIMIT 5;
   │ top-k chunks + scores
   ▼
Prompt assembly:
  System: "You are a revenue research assistant..."
  Context: [chunk1, chunk2, ...]
  User: original query
   │
   ▼
Groq chat completion (llama-3.3-70b-versatile)
   │
   ▼
Streamed response
```

**Chunking strategy:** Fixed-size with overlap. 512-token target chunks, 64-token overlap between adjacent chunks. Chunk boundaries prefer sentence endings when detected. Each chunk stores `metadata` JSON with `{ docId, filename, pageHint, chunkIndex }` for traceability.

---

## Agent Orchestration

The platform uses a single **OrchestratorAgent** that dispatches named tasks to BullMQ workers. There are no peer-to-peer agent connections — all coordination flows through the queue and the orchestrator's state machine.

```typescript
// Simplified orchestrator state machine
type AgentState =
  | { status: "idle" }
  | { status: "researching"; jobId: string }
  | { status: "writing"; researchSummary: string; jobId: string }
  | { status: "complete"; output: string }
  | { status: "error"; reason: string };

class OrchestratorAgent {
  async start(sessionId: string, input: SessionInput): Promise<void> {
    await this.transition(sessionId, "researching");
    const researchJob = await researchQueue.add("research", {
      sessionId,
      input,
    });

    researchJob.on("completed", async (result) => {
      await this.transition(sessionId, "writing");
      await writerQueue.add("write", { sessionId, researchSummary: result });
    });

    researchJob.on("failed", async (err) => {
      await this.transition(sessionId, "error", err.message);
    });
  }
}
```

Each state transition is persisted to the `sessions` table, so the UI can reflect current agent status even on page refresh.

---

## WebSocket Streaming

Elysia handles the WebSocket upgrade and per-session channels. Tokens are pushed from BullMQ workers via Redis pub/sub, then forwarded to the connected client.

```
BullMQ Worker
     │ redis.publish(`session:${sessionId}:tokens`, token)
     ▼
Redis pub/sub
     │ subscribe(`session:${sessionId}:tokens`)
     ▼
Elysia WS handler
     │ ws.send(token)
     ▼
Browser StreamPanel.tsx
     │ ws.onmessage → append to output buffer
     ▼
React state update → rendered text
```

**Protocol:**

- `{ type: "token", data: "..." }` — streaming token from LLM
- `{ type: "status", state: "researching" | "writing" | "complete" }` — agent state change
- `{ type: "error", message: "..." }` — error event
- `{ type: "done" }` — stream end signal

---

## Job Queue Architecture

BullMQ queues are defined with explicit names and typed job data. Workers run in the same Bun process as the API server for simplicity (separated by file, not by process).

```
Queues:
  "embed"     → embed.worker.ts     (concurrency: 3)
  "research"  → research.worker.ts  (concurrency: 2)
  "write"     → writer.worker.ts    (concurrency: 2)

Job lifecycle:
  waiting → active → completed
                  └→ failed (3 retries, exponential backoff)

Failed jobs: stored in BullMQ failed set, visible in logs.
Completed jobs: retained for 1 hour (TTL), then removed.
```

---

## Database Schema

```sql
-- Uploaded sales playbook documents
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'processing', -- processing | ready | failed
  error_message TEXT,
  chunks_total  INTEGER NOT NULL DEFAULT 0, -- expected chunk count, recorded at upload/reembed time
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Chunked + embedded pieces of each document
CREATE TABLE document_chunks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id       UUID REFERENCES documents(id) ON DELETE CASCADE,
  content      TEXT NOT NULL,
  embedding    vector(768),           -- local embedding dimension
  chunk_index  INTEGER NOT NULL,
  metadata     JSONB DEFAULT '{}'
);

-- pgvector index for cosine similarity search
CREATE INDEX ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Agent sessions
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT NOT NULL DEFAULT 'idle',  -- idle | researching | writing | complete | error
  input           JSONB NOT NULL,
  output          TEXT,
  error_message   TEXT,
  retrieval_trace JSONB, -- see Retrieval Trace in README; null until research's retrieval step runs
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

`documents.status`/`error_message`/`chunks_total` and
`sessions.retrieval_trace` were added in
`apps/api/src/db/migrations/002_document_status_and_retrieval_trace.sql`,
after diagnosing an incident where a document could exist in the table
while being partially or fully unsearchable with no visible sign of it
(see [Document Ingestion Status](README.md#document-ingestion-status) in
the README).

---

## Deployment Architecture

```
┌─────────────────────┐      ┌───────────────────────────────────┐
│   Vercel (Free)     │      │         Railway (Hobby $5/mo)     │
│                     │      │                                   │
│  Next.js Frontend   │─────►│  Bun process                      │
│  - Static assets    │ HTTPS│  ├── Hono REST API (:3001)        │
│  - RSC rendering    │      │  ├── Elysia WebSocket (:3001)     │
│  - Edge middleware  │      │  └── BullMQ Workers (in-process)  │
└─────────────────────┘      └──────────┬──────────────┬─────────┘
                                        │              │
                             ┌──────────▼──┐  ┌────────▼────────┐
                             │    Neon     │  │    Upstash      │
                             │  Postgres   │  │    Redis        │
                             │  + pgvector │  │  (Free tier)    │
                             │ (Free tier) │  └─────────────────┘
                             └─────────────┘
                                        │
                             ┌──────────▼──────────┐
                             │     Groq API         │
                             │  llama-3.3-70b       │
                             │  chat completions    │
                             │   (Free tier)        │
                             └─────────────────────┘
```

**Vercel** serves the Next.js frontend. API routes in `app/api/` are thin proxies that forward requests to Railway — they do not talk to Neon or Upstash directly.

**Railway** runs a single Bun process that mounts both Hono (REST) and Elysia (WebSocket). BullMQ workers run in the same process on separate concurrency pools. This is viable for a prototype; a production deployment would separate workers into a second Railway service.

**Neon** provides serverless PostgreSQL with the pgvector extension enabled. The database scales to zero when idle, which keeps the free tier compute budget intact between demo sessions.

**Upstash** provides the Redis instance that BullMQ uses for its queue state. On the free tier (500K commands/month), the polling behaviour of BullMQ workers is manageable for demo-level traffic. For sustained use, switching to Upstash's Fixed 250MB plan ($10/mo) is recommended.

**Groq** is called over HTTPS from the Railway backend. No special networking required. The free tier (30 RPM / 6K TPM) is sufficient for sequential agent runs in a demo context.

---

## Environment Configuration

```
# Backend (Railway)
DATABASE_URL=            # Neon connection string (pooled)
REDIS_HOST=              # Upstash Redis endpoint
REDIS_PORT=6379
REDIS_PASSWORD=          # Upstash Redis password
REDIS_TLS=true           # Upstash TCP Redis requires TLS
GROQ_API_KEY=            # Groq API key (free tier) — required unless USE_MOCK_LLM=true
USE_MOCK_LLM=false       # Test-only escape hatch; must stay false/unset in Railway
PORT=3001                # REST + WebSocket upgrade
FRONTEND_URL=            # Vercel deployment URL (for CORS)

# Frontend (Vercel)
NEXT_PUBLIC_API_URL=     # Railway backend URL
NEXT_PUBLIC_WS_URL=      # Railway WebSocket URL
```

---

## Key Design Decisions

**Bun as runtime** — Bun's built-in TypeScript execution, fast cold starts, and native `bun:sqlite` (unused here but available) make it a strong fit for a backend that needs low overhead and a single runtime for all worker types.

**Hono + Elysia together** — Hono handles the REST API (clean middleware, typed routes, small footprint). Elysia handles WebSockets — its Bun-native WS support is more ergonomic and performant than bolting WS onto Hono directly. Both mount from the same entry point.

**No LangChain / LlamaIndex** — The RAG pipeline is ~150 lines of plain TypeScript. Avoiding framework abstractions keeps the data flow transparent, the bundle small, and the architecture easier to explain in an interview or demo context.

**Single orchestrator, no peer agents** — A graph of autonomous agents adds complexity without benefit at this scope. The orchestrator dispatches jobs by name, workers report back via BullMQ events, and the orchestrator decides what to enqueue next. Simple state machine, easy to trace.

**pgvector over a dedicated vector DB** — Keeping vectors in the same Postgres instance as the rest of the data eliminates a dependency and a network hop. At playbook scale (hundreds to low thousands of chunks), HNSW indexing in pgvector performs well without a dedicated vector store.

**Redis pub/sub for WS token streaming** — Workers don't hold WebSocket references directly (they're in a separate async context from the WS handlers). Redis pub/sub is the clean decoupling layer: workers publish tokens to a session-keyed channel, and the Elysia WS handler subscribes and forwards to the client.

**Embedding quality is a known limitation** — `rag/embed.ts`'s local deterministic hashing embedder is a lexical-overlap (bag-of-words/bigram hash-bucket) scheme, not a learned semantic embedding. Its cosine similarity scores don't reliably separate genuinely relevant playbook content from superficially-overlapping or even unrelated text; `MIN_SIMILARITY_THRESHOLD` in `rag/retrieve.ts` only screens out the worst noise floor, not a precision filter. `retrieval_trace` (persisted per session, surfaced via `GET /api/v1/sessions/:id` and the session detail page's "Retrieval trace" panel) is this system's actual diagnostic tool for judging match quality — read it before assuming a low-scoring or absent chunk means retrieval is broken, and before assuming a chunk scoring above threshold is truly semantically relevant. Swapping in a real embedding model (e.g. via a hosted embeddings API) would be the fix; it's out of scope for the ingestion/retrieval observability work this note accompanies.

**Threshold recalibration (2026-07-06)** — the original `MIN_SIMILARITY_THRESHOLD = 0.1` was measured against short, low-vocabulary-overlap fixture text and only screened a flat near-zero noise floor. Once two full-length real playbooks were ingested (`sample-playbook-enterprise-saas.txt` and `sample-playbook-healthcare-compliance.txt`), a real problem surfaced: the hashing embedder gives two long-form, similarly-structured business documents (both are "playbooks" with a pricing-tiers section and a named case study) meaningfully higher lexical overlap than genuinely unrelated text, even when their subject matter is completely different. Measured full candidate-score distributions (every chunk, not just those clearing a threshold) across three prospect contexts and both new playbooks:

| Prospect context | Same-playbook (correct) chunks | Cross-playbook (wrong-domain) chunks | Generic/unrelated chunks |
| --- | --- | --- | --- |
| Corvid Analytics (SaaS fit) | 0.4225, 0.4222 (SaaS) | 0.3189, 0.2574 (healthcare) | ≤ 0.0433 |
| Blue Harbor Health Network (healthcare fit) | 0.6313, 0.5472 (healthcare) | 0.3710, 0.3629 (SaaS) | ≤ 0.0080 |
| Harlow & Finch (fits neither playbook) | n/a | 0.3190, 0.3170 (SaaS), 0.2816, 0.2509 (healthcare) | ≤ 0.0805 |

The minimum same-playbook (true-positive) score observed was 0.4222; the maximum cross-playbook (false-positive) score observed was 0.3710 — a real, if narrow, gap. `MIN_SIMILARITY_THRESHOLD` was raised from 0.1 to **0.4**, the midpoint of that gap, so retrieval keeps only chunks from the playbook that actually matches the prospect's domain and excludes same-shape-but-wrong-domain playbooks, across every case measured. This is a threshold recalibration against the same hashing embedder, not a fix to the embedder itself — the gap is real but narrow (~0.05), so a sufficiently similar third playbook (e.g. two different SaaS competitor playbooks) could still bleed together at this threshold; a learned semantic embedding remains the actual fix for that class of ambiguity and is still out of scope for this pass.
