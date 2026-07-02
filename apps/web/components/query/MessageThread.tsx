"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { QueryMessage } from "../../types";
import { AssistantMessage } from "./AssistantMessage";
import { UserMessage } from "./UserMessage";

interface MessageThreadProps {
  messages: QueryMessage[];
}

export function MessageThread({ messages }: MessageThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-accent-primary/20 bg-accent-primary/10">
            <Sparkles className="h-10 w-10 text-accent-primary" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-text-primary">
            Query your playbooks
          </h2>
          <p className="mt-2 max-w-sm text-sm text-text-secondary">
            Ask anything about your sales strategy, objection handling, or ICP
            guidance.
          </p>
        </div>
      </div>
    );
  }

  const nodes: ReactNode[] = [];
  let previousTimestamp: string | null = null;

  for (const message of messages) {
    if (message.timestamp !== previousTimestamp) {
      nodes.push(
        <p
          key={`ts-${message.id}`}
          className="py-2 text-center font-mono text-xs text-text-secondary"
        >
          {message.timestamp}
        </p>,
      );
      previousTimestamp = message.timestamp;
    }

    nodes.push(
      message.role === "user" ? (
        <UserMessage
          key={message.id}
          content={message.content}
          timestamp={message.timestamp}
        />
      ) : (
        <AssistantMessage
          key={message.id}
          content={message.content}
          sources={message.sources}
          isLoading={message.isLoading}
        />
      ),
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[780px] flex-col gap-8 px-6 py-8">
        {nodes}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
