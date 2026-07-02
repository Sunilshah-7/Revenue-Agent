import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface RichContentProps {
  content: string;
}

type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ol"; items: string[] }
  | { type: "bullets"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "p"; text: string };

const isBlank = (line: string) => line.trim().length === 0;
const isNumbered = (line: string) => /^\d+\.\s+/.test(line.trim());
const isBullet = (line: string) => line.trim().startsWith("› ");
const isQuoteLine = (line: string) => line.trim().startsWith("> ");
const isTableLine = (line: string) => line.trim().includes("|");
const isSeparatorRow = (line: string) =>
  /^[\s|:-]+$/.test(line) && line.includes("-");

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBlocks(content: string): Block[] {
  const lines = content.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({ type: "h3", text: trimmed.slice(4) });
      i += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push({ type: "h2", text: trimmed.slice(3) });
      i += 1;
      continue;
    }

    if (isNumbered(line)) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (isNumbered(lines[i]) || (isBlank(lines[i]) && isNumbered(lines[i + 1] ?? "")))
      ) {
        if (!isBlank(lines[i])) {
          items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        }
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (isBullet(line)) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (isBullet(lines[i]) || (isBlank(lines[i]) && isBullet(lines[i + 1] ?? "")))
      ) {
        if (!isBlank(lines[i])) {
          items.push(lines[i].trim().replace(/^›\s+/, ""));
        }
        i += 1;
      }
      blocks.push({ type: "bullets", items });
      continue;
    }

    if (isQuoteLine(line)) {
      blocks.push({ type: "quote", text: trimmed.replace(/^>\s+/, "") });
      i += 1;
      continue;
    }

    if (isTableLine(line)) {
      const tableLines: string[] = [];
      while (i < lines.length && isTableLine(lines[i])) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const header = parseTableRow(tableLines[0]);
      const rows = tableLines
        .slice(1)
        .filter((row) => !isSeparatorRow(row))
        .map(parseTableRow);
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !lines[i].trim().startsWith("## ") &&
      !lines[i].trim().startsWith("### ") &&
      !isNumbered(lines[i]) &&
      !isBullet(lines[i]) &&
      !isQuoteLine(lines[i]) &&
      !isTableLine(lines[i])
    ) {
      paragraphLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "p", text: paragraphLines.join(" ") });
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^[\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchIndex = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${matchIndex}`} className="font-semibold text-text-primary">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      nodes.push(
        <span key={`${keyPrefix}-h-${matchIndex}`} className="text-accent-primary">
          {match[2]}
        </span>,
      );
    }

    matchIndex += 1;
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderBlock(block: Block, index: number): ReactNode {
  const key = `block-${index}`;

  switch (block.type) {
    case "h2":
      return (
        <h2 key={key} className="mb-3 mt-1 text-lg font-semibold text-text-primary">
          {renderInline(block.text, key)}
        </h2>
      );

    case "h3":
      return (
        <h3 key={key} className="mb-2 mt-4 text-[15px] font-semibold text-text-primary">
          {renderInline(block.text, key)}
        </h3>
      );

    case "ol":
      return (
        <ol key={key} className="list-none p-0">
          {block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`} className="mb-4 flex gap-3">
              <span className="mt-0.5 w-4 flex-shrink-0 text-sm text-text-secondary">
                {itemIndex + 1}.
              </span>
              <span className="text-[15px] leading-relaxed text-text-primary">
                {renderInline(item, `${key}-${itemIndex}`)}
              </span>
            </li>
          ))}
        </ol>
      );

    case "bullets":
      return (
        <div key={key}>
          {block.items.map((item, itemIndex) => (
            <div key={`${key}-${itemIndex}`} className="mb-3 flex items-start gap-2">
              <ChevronRight className="mt-1 h-3 w-3 flex-shrink-0 text-accent-primary" />
              <span className="text-[15px] leading-relaxed text-accent-primary">
                {renderInline(item, `${key}-${itemIndex}`)}
              </span>
            </div>
          ))}
        </div>
      );

    case "quote":
      return (
        <blockquote
          key={key}
          className="my-4 border-l-4 border-border-active pl-4 py-1 text-[15px] italic leading-relaxed text-text-secondary"
        >
          {renderInline(block.text, key)}
        </blockquote>
      );

    case "table":
      return (
        <table key={key} className="mb-4 mt-3 w-full border-collapse">
          <thead>
            <tr>
              {block.header.map((cell, cellIndex) => (
                <th
                  key={`${key}-h-${cellIndex}`}
                  className={`border-b border-border-subtle py-3 px-4 text-left text-sm font-medium text-text-secondary ${
                    cellIndex === 0 ? "pl-0" : ""
                  }`}
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={`${key}-r-${rowIndex}`} className="border-b border-border-subtle last:border-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${key}-r-${rowIndex}-${cellIndex}`}
                    className={`py-3 px-4 align-top text-sm leading-relaxed ${
                      cellIndex === 0 ? "pl-0 text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );

    case "p":
    default:
      return (
        <p key={key} className="mb-3 text-[15px] leading-relaxed text-text-primary">
          {renderInline(block.text, key)}
        </p>
      );
  }
}

export function RichContent({ content }: RichContentProps) {
  const blocks = parseBlocks(content);

  return <div>{blocks.map((block, index) => renderBlock(block, index))}</div>;
}
