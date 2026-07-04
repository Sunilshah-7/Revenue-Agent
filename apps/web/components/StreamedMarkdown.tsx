// Hand-rolled line-based Markdown renderer (##, ###, "› " bullets, **bold**
// inline spans) — no markdown library, just enough syntax to render the
// research/business-case output streamed from the writer/research agents.
import type { ReactNode } from "react";

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

export function StreamedMarkdown({
  content,
  showCursor = false,
}: {
  content: string;
  showCursor?: boolean;
}) {
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
      {showCursor ? (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-text-primary align-text-bottom" />
      ) : null}
    </>
  );
}
