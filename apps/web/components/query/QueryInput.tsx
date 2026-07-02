"use client";

// Composer bar pinned to the bottom of the Query screen: an
// auto-growing textarea, a streaming-mode toggle, and a send button. Fully
// controlled from the parent (app/query/page.tsx) — this component holds
// no message/network state of its own.
import { ArrowUp } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

interface QueryInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isStreaming: boolean;
  onToggleStreaming: () => void;
}

export function QueryInput({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onToggleStreaming,
}: QueryInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Manual auto-resize: reset to "auto" first so scrollHeight reflects the
  // content after a deletion (shrinking), then grow to fit — a plain CSS
  // solution can't shrink back down without this reset step.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Enter sends, Shift+Enter inserts a newline (standard chat-input
  // convention).
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit();
    }
  }

  const canSend = value.trim().length > 0;

  return (
    <div className="flex-shrink-0 border-t border-border-subtle bg-bg-base px-6 py-3">
      <div className="mx-auto flex max-w-[780px] items-center gap-3 rounded-xl border border-border-subtle bg-bg-elevated px-4 py-3 transition-all focus-within:border-accent-primary focus-within:ring-1 focus-within:ring-accent-primary/20">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask your playbooks a question... (↵ to send, ⇧↵ for newline)"
          className="max-h-[132px] flex-1 resize-none overflow-y-auto bg-transparent text-[15px] text-text-primary outline-none placeholder:text-text-secondary"
        />

        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleStreaming}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
              isStreaming
                ? "border border-accent-primary/40 bg-accent-primary/20 text-accent-primary"
                : "border border-border-subtle bg-bg-elevated text-text-secondary"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isStreaming ? "animate-pulse bg-accent-primary" : "bg-text-secondary"
              }`}
            />
            Streaming
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSend}
            aria-label="Send"
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              canSend
                ? "bg-accent-primary text-white hover:bg-accent-glow"
                : "cursor-not-allowed bg-bg-elevated text-text-secondary"
            }`}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
