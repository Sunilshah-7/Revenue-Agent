"use client";

// Live Session screen ("/session/[id]") — the documented production
// contract (per CLAUDE.md) is GET /api/v1/sessions/:id for persisted state
// plus WS /ws/session/:id for status/token/error/done events. Nothing on
// this page calls either: pipelineSteps, metadataRows, and streamContent
// below are all fixtures, and the useEffect further down fakes token-by-
// token streaming with a setInterval typewriter effect instead of
// consuming the real WebSocket. Contrast with the real, wired variant at
// app/dashboard/[sessionId]/page.tsx + components/StreamPanel.tsx.
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Building2,
  Calendar,
  Check,
  Clock,
  Loader2,
  User,
} from "lucide-react";
import { StatusBadge } from "../../../components/ui/StatusBadge";

type StepState = "complete" | "active" | "future";

interface PipelineStep {
  name: string;
  description: string;
  state: StepState;
  duration?: string;
}

// Fixture prospect metadata — stands in for the "input" field of a real
// SessionRecord fetched from GET /api/v1/sessions/:id.
const metadataRows = [
  { icon: Building2, label: "Company", value: "Stripe Inc." },
  { icon: User, label: "Contact", value: "Patrick Collison" },
  { icon: BookOpen, label: "Playbook", value: "Fintech Growth" },
  { icon: Calendar, label: "Started", value: "Today at 14:32 UTC" },
  { icon: Clock, label: "Elapsed", value: "Running...", live: true },
];

// Fixture pipeline progress — the real pipeline only has two agent stages
// (research, write; see architecture paragraph in CLAUDE.md), so this six-
// step breakdown ("Web Research", "Doc Indexing", "Synthesis", etc.) is a
// more granular UI fiction than the backend actually reports via "status"
// WS events.
const pipelineSteps: PipelineStep[] = [
  {
    name: "Queued",
    description: "Session created, awaiting agent allocation",
    state: "complete",
  },
  {
    name: "Web Research",
    description: "Crawling 14 public data sources",
    state: "complete",
    duration: "0:23",
  },
  {
    name: "Doc Indexing",
    description: "Embedding & retrieving 9,400 context chunks",
    state: "complete",
    duration: "0:41",
  },
  {
    name: "Synthesis",
    description: "Scoring pain signals against playbook vectors",
    state: "complete",
    duration: "0:18",
  },
  {
    name: "Writing",
    description: "Generating business case document",
    state: "active",
  },
  {
    name: "Complete",
    description: "Output ready for review",
    state: "future",
  },
];

// Fixture agent output — stands in for the "token" WS events that would
// otherwise be concatenated live from the real research/write workers.
const streamContent = `## Research Phase — Stripe / Patrick Collison

### 1. Company Intelligence
**Stripe** (founded 2010) is a financial infrastructure platform valued at ~$65B as of its last secondary market pricing. The company processes hundreds of billions in payments annually for ~3M+ businesses globally.

**Recent Signals (Q2 2025):**
› Launched Stripe Tax in 47 new jurisdictions — significant compliance surface expansion
› Acquired Lemon Squeezy ($35M) to enter the creator economy segment
› Engineering headcount grew 18% YoY; 120 open ML/AI roles on Greenhouse
› Patrick Collison recently cited "sales velocity" as a top-3 operational challenge in a Stripe Sessions keynote

### 2. Prospect Profile — Patrick Collison
› **Title:** Co-Founder & CEO
› **Decision authority:** Final approval on strategic tooling >$250K ACV
› **Communication style:** Technical depth preferred; responds to empirical arguments
› **Publicly stated priorities (2025):** Developer experience, AI-native infrastructure, global expansion
› **Notable:** Co-authored internal memo on "10x sales team leverage via automation"

### 3. Pain Analysis`;

function StepItem({ step, isLast }: { step: PipelineStep; isLast: boolean }) {
  const isComplete = step.state === "complete";
  const isActive = step.state === "active";

  return (
    <div className="relative grid grid-cols-[24px_1fr] gap-3 pb-5 last:pb-0">
      {!isLast ? (
        <span className="absolute left-[11px] top-7 h-[calc(100%-28px)] w-0.5 bg-border-subtle" />
      ) : null}

      <div className="relative z-10 h-6 w-6">
        {isActive ? (
          <div className="relative">
            <div className="absolute -inset-1 animate-spin rounded-full border-2 border-accent-primary/30 border-t-accent-primary" />
            <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary">
              <Loader2 className="h-3 w-3 animate-spin text-white" />
            </div>
          </div>
        ) : (
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              isComplete
                ? "border-0 bg-green-active"
                : "border-2 border-border-subtle bg-bg-elevated"
            }`}
          >
            {isComplete ? <Check className="h-3 w-3 text-white" /> : null}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <h3
            className={`text-sm font-semibold ${
              isComplete
                ? "text-green-active"
                : isActive
                  ? "text-accent-primary"
                  : "text-text-secondary"
            }`}
          >
            {step.name}
          </h3>
          {step.duration ? (
            <span className="font-mono text-xs text-text-secondary">
              {step.duration}
            </span>
          ) : null}
          {isActive ? (
            <span className="text-[11px] font-medium text-amber-writing">
              running...
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[11px] leading-4 text-text-secondary">
          {step.description}
        </p>
      </div>
    </div>
  );
}

function Heading({
  level,
  children,
}: {
  level: "##" | "###";
  children: ReactNode;
}) {
  const className =
    level === "##"
      ? "text-base font-bold text-text-primary"
      : "text-sm font-semibold text-text-primary";

  return (
    <h2 className={className}>
      <span className="mr-2 text-text-accent">{level}</span>
      {children}
    </h2>
  );
}

function Paragraph({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-text-mono">{children}</p>;
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 text-text-mono">
      <span className="mr-2 text-text-accent">›</span>
      {children}
    </p>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-bold text-text-primary">{children}</strong>;
}

function renderInline(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <Strong key={index}>{part.slice(2, -2)}</Strong>;
    }
    return part;
  });
}

// Hand-rolled line-based Markdown renderer (##, ###, "› " bullets, **bold**
// inline spans) — no markdown library, just enough syntax to render this
// page's fixture content plus a trailing blinking cursor to sell the
// "still streaming" look.
function StreamedMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");

  return (
    <>
      {lines.map((line, index) => {
        if (line.trim().length === 0) {
          return <div key={index} className="h-4" />;
        }

        if (line.startsWith("## ")) {
          return (
            <section key={index} className={index === 0 ? "" : "mt-6"}>
              <Heading level="##">{line.slice(3)}</Heading>
            </section>
          );
        }

        if (line.startsWith("### ")) {
          return (
            <section key={index} className="mt-6">
              <Heading level="###">{line.slice(4)}</Heading>
            </section>
          );
        }

        if (line.startsWith("› ")) {
          return <Bullet key={index}>{renderInline(line.slice(2))}</Bullet>;
        }

        return <Paragraph key={index}>{renderInline(line)}</Paragraph>;
      })}
      <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-text-primary align-text-bottom" />
    </>
  );
}

export default function LiveAgentSessionPage() {
  const [streamedContent, setStreamedContent] = useState("");
  const streamTokens = useMemo(() => streamContent.split(/(\s+)/), []);

  // Simulates the real WS "token" event stream: reveals one whitespace-
  // delimited token of the fixture text every 30ms via setInterval, rather
  // than appending tokens as they actually arrive over a WebSocket.
  useEffect(() => {
    let tokenIndex = 0;
    const interval = window.setInterval(() => {
      tokenIndex += 1;
      setStreamedContent(streamTokens.slice(0, tokenIndex).join(""));

      if (tokenIndex >= streamTokens.length) {
        window.clearInterval(interval);
      }
    }, 30);

    return () => window.clearInterval(interval);
  }, [streamTokens]);

  const progress = Math.min(
    100,
    Math.round((streamedContent.length / streamContent.length) * 100),
  );

  return (
    <main className="flex min-h-screen bg-bg-base pt-[52px] text-text-primary">
      <section className="min-h-[calc(100vh-52px)] w-[520px] shrink-0 border-r border-border-subtle bg-bg-base p-6">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <StatusBadge status="live" />
        </div>

        <section className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-elevated text-base font-bold text-text-primary">
              ST
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight text-text-primary">
                Stripe
              </h1>
              <p className="mt-1 text-[13px] text-text-secondary">
                Patrick Collison · CEO
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[auto_80px_1fr] gap-x-4 gap-y-3">
            {metadataRows.map((row) => {
              const Icon = row.icon;
              return (
                <div
                  key={row.label}
                  className="contents text-[13px] text-text-primary"
                >
                  <Icon className="mt-0.5 h-4 w-4 text-text-secondary" />
                  <span className="text-xs text-text-secondary">
                    {row.label}
                  </span>
                  <span className="font-medium text-text-primary">
                    {row.value}
                    {row.live ? (
                      <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-active align-middle" />
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-text-secondary">Output progress</span>
            <span className="text-xs text-text-accent">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-bg-elevated">
            <div
              className="h-1.5 rounded-full bg-gradient-to-r from-accent-primary to-green-active transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
            Agent Pipeline
          </h2>
          <div>
            {pipelineSteps.map((step, index) => (
              <StepItem
                key={step.name}
                step={step}
                isLast={index === pipelineSteps.length - 1}
              />
            ))}
          </div>
        </section>
      </section>

      <section className="flex min-h-[calc(100vh-52px)] flex-1 flex-col">
        <div className="flex items-center border-b border-border-subtle bg-bg-elevated px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          </div>
          <p className="flex-1 text-center font-mono text-xs text-text-secondary">
            arap-agent · stripe-collison-2025-06-26
          </p>
          <div className="flex items-center">
            <span className="animate-pulse font-mono text-[11px] text-green-active">
              ▌ streaming
            </span>
            <span className="ml-4 font-mono text-[11px] text-text-secondary">
              {streamedContent.length.toLocaleString()} /{" "}
              {streamContent.length.toLocaleString()} chars
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 font-mono text-[13px] leading-relaxed text-text-mono">
          <StreamedMarkdown content={streamedContent} />
        </div>
      </section>
    </main>
  );
}
