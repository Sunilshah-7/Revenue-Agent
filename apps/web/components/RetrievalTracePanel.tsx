// Collapsible "what did the agent actually retrieve?" panel for the
// session detail page — plain rendering of the retrieval_trace persisted
// by research.worker.ts (see apps/api/src/workers/research.worker.ts).
// Renders nothing if the research stage hasn't run its retrieval step yet.
import type { RetrievalTrace } from "../types";

export function RetrievalTracePanel({
  trace,
}: {
  trace: RetrievalTrace | null;
}) {
  if (!trace) {
    return null;
  }

  return (
    <details className="mt-4 rounded-card border border-border-subtle bg-bg-surface">
      <summary className="cursor-pointer select-none px-6 py-4 text-sm font-semibold text-text-primary">
        Retrieval trace ({trace.chunks.length} of {trace.totalCandidates}{" "}
        candidate{trace.totalCandidates === 1 ? "" : "s"})
      </summary>

      <div className="border-t border-border-subtle px-6 py-4 text-[13px]">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] text-text-secondary sm:grid-cols-4">
          <dt className="font-medium">Top K</dt>
          <dd className="font-mono">{trace.topK}</dd>
          <dt className="font-medium">Threshold</dt>
          <dd className="font-mono">{trace.threshold}</dd>
          <dt className="font-medium">Playbook filter</dt>
          <dd className="font-mono">{trace.playbookId ?? "none"}</dd>
          <dt className="font-medium">Truncated</dt>
          <dd className="font-mono">{trace.truncated ? "yes" : "no"}</dd>
        </dl>

        {trace.chunks.length === 0 ? (
          <p className="mt-4 text-text-secondary">
            No chunks met the similarity threshold for this query.
          </p>
        ) : (
          <table className="mt-4 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wide text-text-secondary">
                <th className="py-1.5 pr-3 font-medium">Filename</th>
                <th className="py-1.5 pr-3 font-medium">Chunk</th>
                <th className="py-1.5 pr-3 font-medium">Score</th>
                <th className="py-1.5 font-medium">Preview</th>
              </tr>
            </thead>
            <tbody>
              {trace.chunks.map((chunk, index) => (
                <tr
                  key={`${chunk.doc_id}-${chunk.chunk_index}-${index}`}
                  className="border-b border-border-subtle/60 align-top last:border-0"
                >
                  <td className="py-1.5 pr-3 font-mono text-text-primary">
                    {chunk.filename}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-text-secondary">
                    {chunk.chunk_index}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-text-secondary">
                    {chunk.score.toFixed(4)}
                  </td>
                  <td className="py-1.5 text-text-secondary">
                    {chunk.preview}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
