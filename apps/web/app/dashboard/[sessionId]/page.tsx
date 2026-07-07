import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { RetrievalTracePanel } from "../../../components/RetrievalTracePanel";
import { StreamPanel } from "../../../components/StreamPanel";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { getSession } from "../../../lib/api";

export default async function SessionDashboardPage({
  params,
}: {
  params: { sessionId: string };
}) {
  const session = await getSession(params.sessionId);

  return (
    <main className="min-h-screen bg-bg-base px-8 pt-[84px] pb-8 text-text-primary">
      <div className="mx-auto max-w-[900px]">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[13px] text-text-secondary transition-colors hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <section className="mt-4 rounded-card border border-border-subtle bg-bg-surface p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-text-primary">
                Agent Session
              </h1>
              <p className="mt-1 font-mono text-xs text-text-secondary">
                {session.id}
              </p>
            </div>
            <StatusBadge status={session.status} />
          </div>

          <pre className="mt-4 whitespace-pre-wrap break-words rounded-md border border-border-subtle bg-bg-elevated p-3 font-mono text-[13px] leading-5 text-text-mono">
            {session.input.prospectContext}
          </pre>
        </section>

        <div className="mt-4">
          <StreamPanel
            sessionId={session.id}
            initialStatus={session.status}
            initialOutput={session.output}
            initialErrorMessage={session.error_message}
            createdAt={session.created_at}
            updatedAt={session.updated_at}
          />
        </div>

        <RetrievalTracePanel trace={session.retrieval_trace} />
      </div>
    </main>
  );
}
