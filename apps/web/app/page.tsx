"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { startSession } from "../lib/api";
import { PlaybookUploader } from "../components/PlaybookUploader";

export default function HomePage() {
  const router = useRouter();
  const [prospectContext, setProspectContext] = useState("");
  const [playbookId, setPlaybookId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      setSubmitting(true);
      const session = await startSession({
        prospectContext,
        playbookId: playbookId || undefined,
      });

      router.push(`/dashboard/${session.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="grid" style={{ gap: 16 }}>
      <section className="card grid" style={{ gap: 10 }}>
        <h1 style={{ margin: 0 }}>AI Revenue Agent Platform</h1>
        <p style={{ margin: 0 }}>
          Upload playbooks, run a research and writing session, and stream
          generated business-case output in real time.
        </p>
      </section>

      <section className="grid two">
        <PlaybookUploader />

        <form className="card grid" onSubmit={onSubmit}>
          <h3 style={{ marginTop: 0 }}>Start Agent Session</h3>
          <label>
            Prospect context
            <textarea
              rows={8}
              value={prospectContext}
              onChange={(e) => setProspectContext(e.target.value)}
              placeholder="Describe buyer profile, company signals, and opportunity context"
              required
            />
          </label>

          <label>
            Playbook ID (optional)
            <input
              value={playbookId}
              onChange={(e) => setPlaybookId(e.target.value)}
              placeholder="Filter by one playbook document UUID"
            />
          </label>

          {error ? (
            <p style={{ color: "#9f1d1d", margin: 0 }}>{error}</p>
          ) : null}

          <button
            type="submit"
            disabled={submitting || prospectContext.trim().length === 0}
          >
            {submitting ? "Starting session..." : "Run Agent"}
          </button>
        </form>
      </section>
    </main>
  );
}
