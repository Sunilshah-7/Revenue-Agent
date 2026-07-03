// Left-aligned chat bubble for the assistant's half of a query turn.
// Renders `content` through RichContent's mini-markdown engine, and — once
// the answer is done — a row of per-chunk retrieval scores below the
// bubble (the frontend counterpart to QueryResponse.chunks[].score in the
// API Contract).
import { ChevronRight, Sparkles } from "lucide-react";
import type { QuerySourceScore } from "../../types";
import { RichContent } from "./RichContent";

interface AssistantMessageProps {
  content: string;
  sources?: QuerySourceScore[];
  isLoading?: boolean;
}

// Color-codes a retrieved chunk's similarity score so higher-confidence
// sources visually stand out (thresholds are arbitrary UI cutoffs, not
// derived from any backend-defined confidence banding).
function scoreColorClass(score: number): string {
  if (score >= 0.93) {
    return "text-green-active";
  }
  if (score >= 0.88) {
    return "text-text-accent";
  }
  return "text-blue-research";
}

export function AssistantMessage({ content, sources, isLoading }: AssistantMessageProps) {
  // Three-dot typing indicator only shows before the first token has
  // arrived; once content starts streaming in, RichContent renders
  // incrementally instead (isLoading can stay true through that phase).
  const showTypingIndicator = Boolean(isLoading) && content.length === 0;

  return (
    <div className="flex items-start gap-4">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-accent-primary/30 bg-accent-primary/20">
        <Sparkles className="h-3.5 w-3.5 text-accent-primary" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="rounded-xl rounded-tl-sm border border-border-subtle bg-bg-surface px-6 py-5">
          {showTypingIndicator ? (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-primary" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-primary [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-primary [animation-delay:300ms]" />
            </span>
          ) : (
            <RichContent content={content} />
          )}
        </div>

        {sources && sources.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <ChevronRight className="h-3 w-3 text-text-secondary" />
            <span className="text-xs text-text-secondary">
              {sources.length} sources retrieved
            </span>
            {sources.map((source, index) => (
              <span
                key={index}
                className={`rounded px-1.5 py-0.5 font-mono text-xs ${scoreColorClass(source.score)}`}
              >
                {source.score.toFixed(2)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
