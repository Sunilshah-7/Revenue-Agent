interface UserMessageProps {
  content: string;
  timestamp: string;
}

export function UserMessage({ content, timestamp }: UserMessageProps) {
  return (
    <div className="ml-auto max-w-[520px]">
      <div className="rounded-2xl rounded-br-sm bg-accent-primary px-5 py-3.5">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white">
          {content}
        </p>
      </div>
      <p className="mt-1 text-right font-mono text-xs text-text-secondary">
        {timestamp}
      </p>
    </div>
  );
}
