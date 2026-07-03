"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  ChevronDown,
  Clock,
  Database,
  Loader2,
  Play,
  Plus,
  Sparkles,
  Terminal,
  Timer,
} from "lucide-react";
import { ScoreChip } from "../../components/ui/ScoreChip";
import { StatusBadge } from "../../components/ui/StatusBadge";

// Dashboard screen ("/dashboard"). Per CLAUDE.md this page is still seeded:
// the intended live flow is GET /api/v1/sessions for recents and
// POST /api/v1/sessions to start a run, then navigate to /session/[id];
// none of that is wired up here yet — recentSessions/metrics/live-activity
// are all hardcoded fixtures, and onSubmit below just fakes a delay and
// navigates with a client-generated UUID instead of calling the API.
type SessionStatus = "complete" | "writing" | "researching" | "error";

interface RecentSession {
  id: string;
  company: string;
  contact: string;
  playbook: string;
  time: string;
  status: SessionStatus;
  score?: number;
  active?: boolean;
}

// Seeded fixture data — stands in for a GET /api/v1/sessions response.
const recentSessions: RecentSession[] = [
  {
    id: "salesforce-benioff",
    company: "Salesforce",
    contact: "Marc Benioff",
    playbook: "Enterprise SaaS",
    time: "2m ago",
    status: "complete",
    score: 94,
    active: true,
  },
  {
    id: "anthropic-amodei",
    company: "Anthropic",
    contact: "Dario Amodei",
    playbook: "AI Infrastructure",
    time: "8m ago",
    status: "writing",
  },
  {
    id: "stripe-collison",
    company: "Stripe",
    contact: "Patrick Collison",
    playbook: "Fintech Growth",
    time: "14m ago",
    status: "researching",
  },
  {
    id: "vercel-rauch",
    company: "Vercel",
    contact: "Guillermo Rauch",
    playbook: "Developer Tools",
    time: "1h ago",
    status: "complete",
    score: 87,
  },
  {
    id: "linear-saarinen",
    company: "Linear",
    contact: "Karri Saarinen",
    playbook: "Product-Led Growth",
    time: "2h ago",
    status: "error",
  },
  {
    id: "figma-field",
    company: "Figma",
    contact: "Dylan Field",
    playbook: "Design Tools",
    time: "3h ago",
    status: "complete",
    score: 91,
  },
  {
    id: "notion-zhao",
    company: "Notion",
    contact: "Ivan Zhao",
    playbook: "Productivity SaaS",
    time: "5h ago",
    status: "complete",
    score: 88,
  },
];

const quickFills = [
  "+ Series B SaaS company",
  "+ Enterprise prospect, 500+ employees",
  "+ Competitor displacement",
];

const defaultContext = `Company: Stripe
Contact: Patrick Collison, CEO
Signal: 18% eng headcount growth, 120 open ML roles
Pain: Manual research taking 4.5h/week per rep`;

// Seeded workspace metrics — no corresponding backend endpoint exists for
// these at all (not part of the six-endpoint API Contract).
const metrics = [
  {
    icon: Terminal,
    trend: "↗ +18% this week",
    value: "1,284",
    label: "Sessions Run",
    detail: "across 3 workspaces",
  },
  {
    icon: Database,
    trend: "↗ +2,341 today",
    value: "94,712",
    label: "Docs Indexed",
    detail: "across 7 data sources",
  },
  {
    icon: Timer,
    trend: "↘ −23s from last week",
    value: "1m 42s",
    label: "Avg. Generation Time",
    detail: "p95: 4m 07s",
  },
];

function Sparkline() {
  return (
    <svg
      viewBox="0 0 220 32"
      aria-hidden="true"
      className="mt-4 h-8 w-full text-green-active/45"
    >
      <path
        d="M2 25 C 20 22, 28 15, 44 17 S 73 29, 92 19 122 5, 144 12 173 24, 193 14 218 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [prospectContext, setProspectContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      // Placeholder for the real flow: POST /api/v1/sessions -> navigate to
      // /session/[returned sessionId]. Currently just simulates latency and
      // fabricates a UUID client-side, so the session that /session/[id]
      // loads next was never actually created on the backend.
      await new Promise((resolve) => setTimeout(resolve, 800));
      router.push(`/session/${crypto.randomUUID()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start agent");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg-base pt-[52px] text-text-primary">
      <aside className="fixed left-0 top-[52px] h-[calc(100vh-52px)] w-[280px] overflow-y-auto border-r border-border-subtle bg-bg-sidebar px-4 py-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
            Recent Sessions
          </h2>
          <button
            type="button"
            aria-label="New session"
            className="rounded-md p-1 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-1">
          {recentSessions.map((session) => (
            <button
              key={`${session.company}-${session.contact}`}
              type="button"
              onClick={() => router.push(`/session/${session.id}`)}
              className={`w-full rounded-md px-3 py-2.5 text-left transition-colors hover:bg-bg-elevated ${
                session.active
                  ? "border-l-2 border-accent-primary bg-bg-elevated"
                  : "border-l-2 border-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-text-primary">
                  {session.company}
                </span>
                <StatusBadge status={session.status} />
              </div>
              <p className="mt-1 truncate text-xs text-text-secondary">
                {session.contact}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-text-secondary">
                  {session.playbook}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-secondary">
                  <Clock className="h-3 w-3" />
                  {session.time}
                </span>
              </div>
              {session.status === "complete" && session.score ? (
                <div className="mt-2 flex justify-end">
                  <ScoreChip score={session.score} />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      </aside>

      <main className="ml-[280px] min-h-[calc(100vh-52px)] p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[26px] font-bold leading-tight text-text-primary">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Thursday, June 26 ·{" "}
              <span className="text-text-accent">3 agents active</span>
            </p>
          </div>
          <span className="rounded-md border border-border-subtle bg-bg-elevated px-3 py-1 font-mono text-xs text-text-secondary">
            workspace: growth-team
          </span>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-6 rounded-card border border-border-subtle bg-bg-surface p-6"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent-primary" />
            <h2 className="text-base font-semibold text-text-primary">
              New Agent Session
            </h2>
          </div>
          <p className="mt-1 text-[13px] text-text-secondary">
            Paste prospect context and the agent will research, score, and
            generate a tailored business case.
          </p>

          <label
            htmlFor="prospect-context"
            className="mt-5 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary"
          >
            Prospect Context
          </label>
          <textarea
            id="prospect-context"
            rows={5}
            value={prospectContext}
            onChange={(event) => setProspectContext(event.target.value)}
            placeholder={defaultContext}
            className="mt-2 w-full resize-none rounded-md border border-border-subtle bg-bg-elevated p-3 font-mono text-[13px] leading-5 text-text-mono placeholder:text-text-secondary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/30"
          />

          <div className="mt-4 flex items-end gap-4">
            <div className="min-w-0 flex-1">
              <label className="block text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
                Playbook
              </label>
              <button
                type="button"
                className="mt-2 flex w-full items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 py-2.5 text-sm text-text-primary transition-colors hover:border-border-active"
              >
                <BookOpen className="h-3.5 w-3.5 text-accent-primary" />
                <span>Enterprise SaaS</span>
                <ChevronDown className="ml-auto h-3.5 w-3.5 text-text-secondary" />
              </button>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-md bg-accent-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors duration-150 hover:bg-accent-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
              {submitting ? "Running" : "Run Agent"}
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {quickFills.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() =>
                  setProspectContext((current) =>
                    current.trim().length > 0 ? `${current}\n${chip}` : chip,
                  )
                }
                className="rounded-full border border-border-subtle px-2.5 py-1 text-xs text-text-secondary transition-colors hover:border-accent-primary hover:text-accent-primary"
              >
                {chip}
              </button>
            ))}
          </div>

          {error ? (
            <p className="mt-3 text-xs text-red-error">{error}</p>
          ) : null}
        </form>

        <section className="mt-6 grid grid-cols-3 gap-4">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article
                key={metric.label}
                className="rounded-card border border-border-subtle bg-bg-surface p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-[11px] font-medium text-green-active">
                    {metric.trend}
                  </span>
                </div>
                <p className="mt-5 text-[38px] font-bold leading-none text-text-primary">
                  {metric.value}
                </p>
                <p className="mt-2 text-[13px] text-text-secondary">
                  {metric.label}
                </p>
                <p className="mt-1 text-[11px] text-text-secondary">
                  {metric.detail}
                </p>
                <Sparkline />
              </article>
            );
          })}
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
              Live Activity
            </h2>
            <button
              type="button"
              className="text-xs text-text-accent transition-colors hover:underline"
            >
              View all ›
            </button>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                <th className="pb-2 font-medium">Company</th>
                <th className="pb-2 font-medium">Contact</th>
                <th className="pb-2 font-medium">Playbook</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Score</th>
                <th className="pb-2 text-right font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border-subtle text-sm text-text-primary">
                <td className="py-3 font-medium">Salesforce</td>
                <td className="py-3 text-text-secondary">Marc Benioff</td>
                <td className="py-3 font-mono text-xs text-text-secondary">
                  Enterprise SaaS
                </td>
                <td className="py-3">
                  <StatusBadge status="complete" />
                </td>
                <td className="py-3">
                  <ScoreChip score={94} />
                </td>
                <td className="py-3 text-right text-text-secondary">2m ago</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
