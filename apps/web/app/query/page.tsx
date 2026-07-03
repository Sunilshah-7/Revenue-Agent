"use client";

// Query screen ("/query") — per CLAUDE.md, its backend contract is
// POST /api/v1/query (optionally SSE), but this page is entirely canned:
// SEED_MESSAGES/CANNED_RESPONSE below are fixtures, and handleSubmit
// simulates either a streamed or non-streamed reply with setTimeout/
// setInterval instead of calling lib/api.ts or opening an SSE connection.
// This is the screen most recently touched by feature/query-screen-rag-chat
// (the branch this docs branch was cut from) — the presentational layer
// (components/query/*) is built, but the network call itself is not wired.
import { Terminal, X } from "lucide-react";
import { useState } from "react";
import { MessageThread } from "../../components/query/MessageThread";
import { PlaybookDropdown } from "../../components/query/PlaybookDropdown";
import { QueryInput } from "../../components/query/QueryInput";
import { SuggestionChips } from "../../components/query/SuggestionChips";
import type { QueryMessage } from "../../types";

// Fixture thread history — stands in for whatever a real query session's
// prior turns would be (there is no persistence of query threads on the
// backend; QueryRequest/QueryResponse in the API Contract are stateless
// per-call, so even wiring this up would need client-side thread state).
const SEED_MESSAGES: QueryMessage[] = [
  {
    id: "1",
    role: "user",
    content:
      "What's our recommended pricing positioning when competing with Gong in an enterprise deal?",
    timestamp: "14:08",
  },
  {
    id: "2",
    role: "assistant",
    timestamp: "14:08",
    sources: [{ score: 0.97 }, { score: 0.91 }, { score: 0.88 }],
    content: `When positioning against Gong in enterprise deals, lead with **outcome breadth** rather than feature parity. Gong is deeply entrenched as a call-intelligence layer — trying to compete on that dimension directly is a losing frame.

**Recommended positioning sequence:**

1. **Start with the research gap.** Gong captures what happened on calls; ARAP eliminates the manual research required [before] calls happen. Frame them as sequential, not competitive.

2. **Quantify pre-call time cost.** At enterprise scale (500+ rep orgs), pre-call research averages 4.5–6 hours per rep per week. At $90/hr fully-loaded cost, that's $10M+/yr in value destruction for a 400-rep team. Gong doesn't touch this.

3. **Business case generation is the wedge.** If the prospect's SDR team is manually writing discovery briefs and business cases, position ARAP as the system that generates those in <2 minutes with full context. No Gong equivalent exists.

**Objection: "We already have Gong — why add another tool?"**

> "Gong tells you what was said. ARAP tells you what to say — and why it will land. They're upstream/downstream of the same workflow, not duplicates."

**Pricing note:** ARAP typically comes in at 60–75% of Gong's per-seat cost. Lead with value, but have this in your back pocket for budget objection pivots.`,
  },
  {
    id: "3",
    role: "user",
    content: 'How should I handle a prospect who says "we already have Clay" during discovery?',
    timestamp: "14:11",
  },
  {
    id: "4",
    role: "assistant",
    timestamp: "14:11",
    sources: [{ score: 0.94 }, { score: 0.89 }, { score: 0.85 }],
    content: `The Clay objection is actually a **buying signal in disguise** — it confirms the prospect is already investing in sales intelligence and sees value in the category. Your job is to reframe the conversation around synthesis, not enrichment.

**The core distinction:**

| Layer | Clay | ARAP |
|---|---|---|
| What it does | Data enrichment & waterfall lookups | Research synthesis + business case generation |
| Output | Populated fields (company size, tech stack, emails) | Narrative intelligence, pain analysis, ROI models |
| Time saved | ~2 hrs/week (data entry) | ~4.5 hrs/week (research + writing) |
| AI component | Minimal (lookup automation) | Core (LLM synthesis across 15+ sources) |

**Discovery questions to pivot with:**

› "Once Clay has enriched a record — what happens next? Who turns that data into a business case?"
› "How long does it take your reps to go from enriched contact to first personalized outreach?"
› "Do your SDRs have a consistent way of identifying why a specific prospect needs your product right now?"

**Positioning close:**

> "Clay fills in the data fields. ARAP reads those fields, crawls 12 additional sources, and tells your rep: here's exactly why this company has a budget problem we solve, here's the ROI, and here's the email that will land. They're the start and end of the same pipeline."

**Typical path forward:** Propose a parallel pilot where Clay-enriched records are fed directly into ARAP as context — this shows immediate compound value rather than displacement.`,
  },
];

// Single fixture answer returned for every query regardless of what was
// asked — stands in for QueryResponse.answer from a real POST
// /api/v1/query call.
const CANNED_RESPONSE = `Based on your indexed playbooks, here's what I found...

**Key insight:** This aligns with your Enterprise SaaS playbook's guidance on handling competitive displacement.

› Focus on outcome differentiation, not feature comparison
› Lead with a quantified ROI model specific to their team size
› Use the discovery questions framework from the Fintech Growth playbook

> "The best competitive position is one where the competitor isn't even in the room — frame ARAP as solving a problem Gong was never designed to address."

**Recommended next step:** Run a full agent session with this prospect's context to generate a tailored business case.`;

function formatTimestamp(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export default function QueryPlaybooksPage() {
  const [messages, setMessages] = useState<QueryMessage[]>(SEED_MESSAGES);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(true);
  const [, setIsLoading] = useState(false);
  const [activePlaybook, setActivePlaybook] = useState("All Playbooks");

  // Simulates both response modes the real endpoint supports (stream vs.
  // non-stream) purely with client-side timers over the one fixed
  // CANNED_RESPONSE string — no fetch/EventSource call happens here at all.
  function handleSubmit() {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return;
    }

    const timestamp = formatTimestamp(new Date());
    const userMessage: QueryMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp,
    };

    const assistantId = crypto.randomUUID();
    const assistantPlaceholder: QueryMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp,
      isLoading: true,
    };

    setMessages((current) => [...current, userMessage, assistantPlaceholder]);
    setInput("");
    setIsLoading(true);

    const streamNow = isStreaming;

    window.setTimeout(() => {
      if (streamNow) {
        let index = 0;
        const intervalId = window.setInterval(() => {
          index += 1;
          const nextChunk = CANNED_RESPONSE.slice(0, index);
          const isDone = index >= CANNED_RESPONSE.length;

          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: nextChunk,
                    isLoading: !isDone,
                    sources: isDone
                      ? [{ score: 0.93 }, { score: 0.87 }]
                      : message.sources,
                  }
                : message,
            ),
          );

          if (isDone) {
            window.clearInterval(intervalId);
            setIsLoading(false);
          }
        }, 18);
      } else {
        window.setTimeout(() => {
          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: CANNED_RESPONSE,
                    isLoading: false,
                    sources: [{ score: 0.93 }, { score: 0.87 }],
                  }
                : message,
            ),
          );
          setIsLoading(false);
        }, 1200);
      }
    }, 600);
  }

  function handleClearThread() {
    setMessages([]);
    setInput("");
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-base pt-[52px]">
      <div className="flex h-12 flex-shrink-0 items-center gap-4 border-b border-border-subtle bg-bg-base px-6">
        <div className="flex items-center">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-bg-elevated">
            <Terminal className="h-4 w-4 text-text-secondary" />
          </span>
          <h1 className="ml-2 text-[15px] font-semibold text-text-primary">
            Query Playbooks
          </h1>
          <p className="ml-1 text-xs text-text-secondary">
            RAG-powered retrieval across all indexed documents
          </p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <PlaybookDropdown
            activePlaybook={activePlaybook}
            onSelect={setActivePlaybook}
          />

          <button
            type="button"
            onClick={handleClearThread}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
            Clear thread
          </button>

          <button
            type="button"
            className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
          >
            <span className="mr-1 rounded border border-border-subtle bg-bg-base px-1 py-0.5 font-mono text-[10px]">
              ⌘K
            </span>
            Command palette
          </button>
        </div>
      </div>

      <MessageThread messages={messages} />

      <SuggestionChips onSelect={setInput} />

      <QueryInput
        value={input}
        onChange={setInput}
        onSubmit={handleSubmit}
        isStreaming={isStreaming}
        onToggleStreaming={() => setIsStreaming((current) => !current)}
      />

      {/* Fixture status line — "text-embedding-3-large" does not match the
          actual retrieval model: rag/embed.ts uses a local deterministic
          hashing embedder, not an OpenAI embeddings model. Document/chunk
          counts are hardcoded too, not read from GET /api/v1/documents. */}
      <p className="mx-auto max-w-[780px] flex-shrink-0 px-6 pb-2 text-center font-mono text-[11px] text-text-secondary">
        Retrieval model: text-embedding-3-large{" "}
        <span className="text-border-active">·</span> 9 documents{" "}
        <span className="text-border-active">·</span> 2,208 chunks
      </p>
    </div>
  );
}
