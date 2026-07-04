# AI Revenue Agent Platform

A full-stack AI agent platform that automates revenue research, buyer engagement, and business-case generation. Built with Bun, Hono, Elysia, Next.js, PostgreSQL + pgvector, Redis, and BullMQ. Uses Groq's free-tier inference API (Llama 3.3 70B) — no paid LLM subscription required.

**Live demo:** `https://revenue-agent-web.vercel.app/dashboard`

---

## What it does

1. **Ingest sales playbooks** — Upload internal docs (PDF, TXT). They are chunked, embedded, and stored in pgvector for retrieval.
2. **Run an agent session** — A single orchestrator agent dispatches research and writing tasks through a BullMQ job queue.
3. **Stream results in real time** — LLM output tokens are streamed over WebSockets from the backend to the browser as they arrive.
4. **Generate a business case** — The writer agent synthesizes the research into a structured output grounded in your playbook content.

---

## Tech Stack

| Layer               | Technology                                    |
| ------------------- | --------------------------------------------- |
| Frontend            | Next.js 14 (`app/` router), React, TypeScript |
| Backend API         | Hono on Bun                                   |
| WebSocket server    | Elysia on Bun                                 |
| Job queue           | BullMQ                                        |
| Database            | PostgreSQL via Neon (serverless)              |
| Vector search       | pgvector (on Neon)                            |
| Cache / queue store | Redis via Upstash                             |
| LLM inference       | Groq — `llama-3.3-70b-versatile`              |
| Embeddings          | Local deterministic 768-dim hashing           |
| Frontend deploy     | Vercel                                        |
| Backend deploy      | Railway                                       |

---

## Project Structure

```
ai-revenue-agent/
├── apps/
│   ├── web/                    # Next.js frontend (Vercel)
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── dashboard/
│   │   │   │   └── [sessionId]/page.tsx
│   │   │   ├── playbooks/
│   │   │   │   └── page.tsx
│   │   │   └── api/
│   │   │       ├── documents/route.ts
│   │   │       └── sessions/route.ts
│   │   ├── components/
│   │   │   ├── StreamPanel.tsx
│   │   │   ├── PlaybookUploader.tsx
│   │   │   └── AgentStatusBadge.tsx
│   │   └── lib/
│   │       ├── ws-client.ts
│   │       └── api.ts
│   └── api/                    # Bun backend (Railway)
│       └── src/
│           ├── index.ts
│           ├── routes/
│           ├── ws/
│           ├── agents/
│           ├── workers/
│           ├── rag/
│           ├── db/
│           └── redis/
├── Architecture.md
└── README.md
```

---

## Prerequisites

- [Bun](https://bun.sh) v1.1+
- [Node.js](https://nodejs.org) v20+ (for tooling)
- Accounts on: [Neon](https://neon.tech), [Upstash](https://upstash.com), [Groq](https://console.groq.com), [Vercel](https://vercel.com), [Railway](https://railway.com)

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/your-username/ai-revenue-agent.git
cd ai-revenue-agent

# Install frontend deps
cd apps/web && bun install

# Install backend deps
cd ../api && bun install
```

### 2. Set up Neon (PostgreSQL + pgvector)

1. Create a free project at [neon.tech](https://neon.tech)
2. In the Neon SQL editor, run the migrations:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  content       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'processing', -- processing | ready | failed
  error_message TEXT,
  chunks_total  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID REFERENCES documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  embedding   vector(768),
  chunk_index INTEGER NOT NULL,
  metadata    JSONB DEFAULT '{}'
);

CREATE INDEX ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status          TEXT NOT NULL DEFAULT 'idle',
  input           JSONB NOT NULL,
  output          TEXT,
  error_message   TEXT,
  retrieval_trace JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

3. Copy the **pooled connection string** from your Neon dashboard.

> **Existing hosted database?** These columns were added in
> `apps/api/src/db/migrations/002_document_status_and_retrieval_trace.sql`.
> Run that file's statements (it's idempotent — `ADD COLUMN IF NOT EXISTS`)
> against your Neon database to pick them up without recreating tables. See
> [Document Ingestion Status](#document-ingestion-status) and
> [Retrieval Trace](#retrieval-trace) below for what they're for.

### 3. Set up Upstash (Redis)

1. Create a free database at [upstash.com](https://upstash.com/redis)
2. Copy the **endpoint** and **password** from the dashboard.
3. Note: the free tier provides 500K commands/month. For sustained local development, monitor usage in the Upstash console.

### 4. Get a Groq API key

1. Sign up at [console.groq.com](https://console.groq.com) — no credit card required.
2. Navigate to API Keys → Create Key.
3. Model used: `llama-3.3-70b-versatile` for chat completions. Embeddings are generated locally for the demo.

### 5. Configure environment variables

**Backend** — create `apps/api/.env`:

```env
DATABASE_URL=postgresql://...      # Neon pooled connection string
REDIS_HOST=your-db.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-upstash-password
REDIS_TLS=true
GROQ_API_KEY=gsk_...                # required unless USE_MOCK_LLM=true
PORT=3001
FRONTEND_URL=http://localhost:3000
```

`USE_MOCK_LLM` (default `false`) is a test-only escape hatch that returns a canned completion instead of calling Groq. Leave it unset here — every dev/prod run must hit the real Groq API. It's set to `true` only in `apps/api/.env.local.example`, and is otherwise activated by the test runner via `NODE_ENV=test`.

**Frontend** — create `apps/web/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### 6. Run locally

```bash
# From the repo root — starts backend + frontend together
npm run dev
```

Or run them separately in two terminals:

```bash
# Terminal 1 — backend
cd apps/api
bun run src/index.ts

# Terminal 2 — frontend
cd apps/web
bun run dev
```

Frontend: `http://localhost:3000`  
Backend API: `http://localhost:3001`  
WebSocket: `ws://localhost:3001/ws/session/:id`  
Interactive API docs: `http://localhost:3001/openapi`

---

## Deployment

### Backend → Railway

1. Create a new project at [railway.com](https://railway.com).
2. Connect your GitHub repo and set the root directory to `apps/api`.
3. Railway will detect Bun automatically via `bun.lockb`.
4. Add the environment variables from `apps/api/.env` in the Railway dashboard under **Variables**.
5. Set the start command: `bun run src/index.ts`
6. Deploy. Railway assigns a public URL — copy it.

> **Free tier note:** Railway's trial includes $5 of credit (approximately 30 days for a lightweight service). After the trial, the Hobby plan is $5/month. This is the only paid component in the stack.

### Frontend → Vercel

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. Set the root directory to `apps/web`.
3. Add environment variables:
   - `NEXT_PUBLIC_API_URL` → your Railway backend URL
   - `NEXT_PUBLIC_WS_URL` → your Railway WebSocket URL (use `wss://` for the deployed URL)
4. Deploy. Vercel assigns a `.vercel.app` URL.

Update `FRONTEND_URL` in Railway's environment variables to match your Vercel URL (needed for CORS).

### Verify the deployment

```bash
# Health check
curl https://your-railway-url/health

# Expected: { "status": "ok", "timestamp": "..." }
```

---

## API Reference

For an interactive, browsable version of everything below (with "try it out" against a running server), start the API and visit `/openapi`.

### REST (Hono — port 3001)

| Method | Path                   | Description                           |
| ------ | ---------------------- | ------------------------------------- |
| `GET`  | `/health`                       | Health check                                   |
| `POST` | `/api/v1/documents`             | Upload and ingest a playbook document          |
| `GET`  | `/api/v1/documents`             | List all ingested documents, with status       |
| `POST` | `/api/v1/documents/:id/reembed` | Re-chunk/re-embed an existing document         |
| `GET`  | `/api/v1/sessions`              | List recent agent sessions                     |
| `POST` | `/api/v1/sessions`              | Start a new agent session                      |
| `GET`  | `/api/v1/sessions/:id`          | Get session status, output, and retrieval trace |
| `POST` | `/api/v1/query`                 | One-shot RAG query against playbooks           |

**`POST /api/v1/sessions` request body** — `playbookId` is optional (omit it to search across all indexed playbooks):

```json
{ "prospectContext": "Series B fintech hiring 30 account executives", "playbookId": "7ddf80a5-9807-45a2-a2c3-dac090a83871" }
```

```json
{ "sessionId": "1dd1d470-b0ee-4f0f-a48f-f780c0faf25c", "status": "researching" }
```

### Document Ingestion Status

Every document has a `status`: `processing` (embed jobs still running),
`ready` (every expected chunk is chunked and embedded), or `failed` (a
chunk's embed job exhausted its retries, or the document produced zero
chunks). `GET /api/v1/documents` returns `status`, `error_message`, and
`chunk_count` (the actually-embedded count, which can differ from
`chunks_total` while a document is still `processing`) per document — so a
document that "exists" but is unsearchable is visibly distinguishable from
one that's fully indexed, instead of looking identical to both a human and
to retrieval.

To repair a `failed` document (or one ingested before this column
existed) without re-uploading the original file:

```bash
curl -X POST http://localhost:3001/api/v1/documents/<id>/reembed
# { "documentId": "<id>", "chunksQueued": 3, "status": "processing" }
```

This deletes the document's existing chunks and re-chunks/re-embeds its
already-stored `content` from scratch — safe to call more than once.

**A crash mid-ingestion is self-healing, within a bound.** Since embed jobs
run as BullMQ jobs, killing the process while one is in flight leaves the
document in `processing`, but BullMQ's stalled-job detection reassigns
that job once any worker resumes polling the `embed` queue (verified
locally: recovery happened within its default ~30s `stalledInterval`
after restart) — the document then completes normally, or is marked
`failed` if it keeps stalling past `maxStalledCount`. The one case this
doesn't cover is a worker that never restarts at all (a permanently dead
deployment), which would leave a document in `processing` indefinitely
with no automatic recovery; a periodic sweep marking long-`processing`
documents `failed` would close that gap, but isn't implemented here.

### Retrieval Trace

`GET /api/v1/sessions/:id` includes `retrieval_trace`, populated once the
research stage's retrieval step has run for that session (`null` before
then):

```json
{
  "query": "...",
  "topK": 5,
  "threshold": 0.1,
  "playbookId": null,
  "totalCandidates": 3,
  "truncated": false,
  "chunks": [
    { "doc_id": "...", "filename": "test-playbook.txt", "chunk_index": 0, "score": 0.329, "preview": "Revenue Playbook: Mid-Market SaaS Expansion..." }
  ]
}
```

`threshold` is `MIN_SIMILARITY_THRESHOLD` from `apps/api/src/rag/retrieve.ts`
— chunks scoring below it are dropped before they ever reach the LLM
prompt. **Embeddings are a known limitation**, not retrieval logic: per the
Tech Stack table, `rag/embed.ts` is a local deterministic lexical hashing
scheme (shared word/bigram hash-bucket overlap), not a learned semantic
embedding, so its cosine scores don't cleanly separate "relevant" from
"irrelevant" — an unrelated query can still score ~0.1-0.14 purely from
hash collisions. `retrieval_trace` (and the Session detail page's
"Retrieval trace" panel) is the intended diagnostic tool for judging match
quality in this system, not a guarantee that a high score means real
semantic relevance.

### WebSocket (Elysia — same port via upgrade)

**Connect:** `wss://your-backend-url/ws/session/:sessionId`

**Incoming message types:**

```json
{ "type": "token",  "data": "..." }
{ "type": "status", "state": "researching" }
{ "type": "status", "state": "writing" }
{ "type": "status", "state": "complete" }
{ "type": "error",  "message": "..." }
{ "type": "done" }
```

---

## Infrastructure Costs

Everything in this stack has a free tier sufficient for demo and portfolio use.

| Service       | Free Tier                       | Paid (if needed)           |
| ------------- | ------------------------------- | -------------------------- |
| Vercel        | Free forever (Hobby)            | $20/mo (Pro)               |
| Railway       | $5 credit / 30 days             | $5/mo (Hobby)              |
| Neon          | 0.5 GB, 100 CU-hr/mo, no expiry | ~$0.10/CU-hr (Launch)      |
| Upstash Redis | 500K commands/mo, 256 MB        | $10/mo (Fixed 250MB)       |
| Groq          | 30 RPM, 6K TPM, 14.4K req/day   | $0.59/M tokens (Llama 70B) |

**Estimated monthly cost to keep the demo live: $5/mo** (Railway Hobby only).

---

## Architecture

See [Architecture.md](./Architecture.md) for a full breakdown of:

- System topology diagram
- RAG pipeline design
- Agent orchestration state machine
- WebSocket streaming protocol
- Job queue configuration
- Database schema
- Key design decisions

---

## Roadmap

The current build is a working skeleton demonstrating the core technical patterns. Planned extensions:

- Buyer engagement module (outreach draft generation)
- Multi-playbook support with per-session context selection
- Queue dashboard (BullMQ Board UI)
- Auth (Clerk or NextAuth)
- Document management UI (delete, re-embed)
- Evaluation harness for RAG retrieval quality

---

## License

MIT
