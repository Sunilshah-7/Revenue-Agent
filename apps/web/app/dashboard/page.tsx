"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Database, Loader2, Play, Plus, Sparkles, Terminal } from "lucide-react";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { listDocuments, listSessions, startSession } from "../../lib/api";
import { formatRelativeTime } from "../../lib/format";
import type { SessionRecord } from "../../types";

const SESSIONS_POLL_INTERVAL_MS = 12_000;

function sessionLabel(session: SessionRecord): string {
  const firstLine = session.input.prospectContext.split("\n")[0]?.trim() ?? "";
  if (firstLine.length === 0) {
    return "Untitled session";
  }
  return firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine;
}

export default function DashboardPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [prospectContext, setProspectContext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sessionsResult, documentsResult] = await Promise.all([
        listSessions(),
        listDocuments(),
      ]);
      setSessions(sessionsResult);
      setDocumentCount(documentsResult.length);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to reach the backend",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), SESSIONS_POLL_INTERVAL_MS);
    window.addEventListener("focus", refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const trimmed = prospectContext.trim();
    if (trimmed.length === 0) {
      setFormError("Prospect context is required.");
      return;
    }

    try {
      setSubmitting(true);
      const result = await startSession({ prospectContext: trimmed });
      router.push(`/dashboard/${result.sessionId}`);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Failed to start agent session",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const activeCount = sessions.filter(
    (s) => s.status === "researching" || s.status === "writing",
  ).length;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

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
            onClick={() => textareaRef.current?.focus()}
            className="rounded-md p-1 text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="px-1 text-[13px] text-text-secondary">
            No sessions yet — run your first agent.
          </p>
        ) : (
          <div className="space-y-1">
            {sessions.slice(0, 10).map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => router.push(`/dashboard/${session.id}`)}
                className="w-full rounded-md border-l-2 border-transparent px-3 py-2.5 text-left transition-colors hover:bg-bg-elevated"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-text-primary">
                    {sessionLabel(session)}
                  </span>
                  <StatusBadge status={session.status} />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-text-secondary">
                    <Clock className="h-3 w-3" />
                    {formatRelativeTime(session.created_at)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </aside>

      <main className="ml-[280px] min-h-[calc(100vh-52px)] p-8">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-[26px] font-bold leading-tight text-text-primary">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              {today}
              {activeCount > 0 ? (
                <>
                  {" · "}
                  <span className="text-text-accent">
                    {activeCount} agent{activeCount === 1 ? "" : "s"} active
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {loadError ? (
          <p className="mt-4 rounded-md border border-red-error/30 bg-red-error/10 px-3 py-2 text-xs text-red-error">
            {loadError}
          </p>
        ) : null}

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
            Paste prospect context and the agent will research and generate a
            tailored business case.
          </p>

          <label
            htmlFor="prospect-context"
            className="mt-5 block text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary"
          >
            Prospect Context
          </label>
          <textarea
            ref={textareaRef}
            id="prospect-context"
            rows={5}
            value={prospectContext}
            onChange={(event) => setProspectContext(event.target.value)}
            placeholder={"Company: Acme Corp\nContact: Jane Doe, VP Sales\nSignal: ...\nPain: ..."}
            className="mt-2 w-full resize-none rounded-md border border-border-subtle bg-bg-elevated p-3 font-mono text-[13px] leading-5 text-text-mono placeholder:text-text-secondary focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/30"
          />

          <div className="mt-4 flex items-end justify-end gap-4">
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

          {formError ? (
            <p className="mt-3 text-xs text-red-error">{formError}</p>
          ) : null}
        </form>

        <section className="mt-6 grid grid-cols-3 gap-4">
          <article className="rounded-card border border-border-subtle bg-bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
              <Terminal className="h-4 w-4" />
            </span>
            <p className="mt-5 text-[38px] font-bold leading-none text-text-primary">
              {sessions.length}
            </p>
            <p className="mt-2 text-[13px] text-text-secondary">Sessions Run</p>
          </article>

          <article className="rounded-card border border-border-subtle bg-bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
              <Database className="h-4 w-4" />
            </span>
            <p className="mt-5 text-[38px] font-bold leading-none text-text-primary">
              {documentCount ?? "—"}
            </p>
            <p className="mt-2 text-[13px] text-text-secondary">Docs Indexed</p>
          </article>

          <article className="rounded-card border border-border-subtle bg-bg-surface p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
              <Loader2 className="h-4 w-4" />
            </span>
            <p className="mt-5 text-[38px] font-bold leading-none text-text-primary">
              {activeCount}
            </p>
            <p className="mt-2 text-[13px] text-text-secondary">Agents Active</p>
          </article>
        </section>

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
              Live Activity
            </h2>
          </div>

          {sessions.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No sessions yet — run your first agent above.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-[0.2em] text-text-secondary">
                  <th className="pb-2 font-medium">Prospect Context</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 text-right font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => router.push(`/dashboard/${session.id}`)}
                    className="cursor-pointer border-b border-border-subtle text-sm text-text-primary hover:bg-bg-elevated"
                  >
                    <td className="py-3 font-medium">{sessionLabel(session)}</td>
                    <td className="py-3">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="py-3 text-right text-text-secondary">
                      {formatRelativeTime(session.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  );
}
