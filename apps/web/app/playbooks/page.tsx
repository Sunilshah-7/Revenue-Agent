"use client";

// Playbooks screen ("/playbooks") — per CLAUDE.md, upload is the one live
// piece of this page (uploadDocument() below really calls the
// /api/documents proxy -> POST /api/v1/documents), but the card grid,
// filters, and sort controls all operate over the seeded `playbooks` array,
// not GET /api/v1/documents. A newly uploaded file does not appear in the
// grid: this page's live and seeded data are disconnected.
import { ChangeEvent, DragEvent, useRef, useState } from "react";
import {
  Calendar,
  CheckCircle,
  FileText,
  Loader2,
  Upload,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { uploadDocument } from "../../lib/api";

type FileType = "PDF" | "TXT" | "MD" | "DOCX";
type PlaybookStatus = "Indexed" | "Processing" | "Failed";
type ActiveFilter = "All" | PlaybookStatus;
type ToastState = { filename: string; phase: "uploading" | "queued" } | null;

interface Playbook {
  title: string;
  size: string;
  type: FileType;
  status: PlaybookStatus;
  sessions: number;
  chunks: number;
  date: string;
}

// Seeded fixture cards — stands in for a GET /api/v1/documents response.
// Note MD/DOCX file types appear here and in the upload accept list below,
// but routes/documents.ts's extractTextFromFile only actually supports
// PDF and TXT server-side — uploading a .md/.docx file would fail at
// extraction time despite being accepted by the file picker.
const playbooks: Playbook[] = [
  {
    title: "Enterprise SaaS Sales Playbook Q2 2025.pdf",
    size: "3.4 MB",
    type: "PDF",
    status: "Indexed",
    sessions: 42,
    chunks: 847,
    date: "Jun 24, 2025",
  },
  {
    title: "Fintech Objection Handling Guide.pdf",
    size: "1.1 MB",
    type: "PDF",
    status: "Indexed",
    sessions: 18,
    chunks: 312,
    date: "Jun 22, 2025",
  },
  {
    title: "AI Infrastructure ICP Profile.txt",
    size: "48 KB",
    type: "TXT",
    status: "Indexed",
    sessions: 29,
    chunks: 94,
    date: "Jun 21, 2025",
  },
  {
    title: "Developer Tools GTM Strategy 2025.md",
    size: "92 KB",
    type: "MD",
    status: "Indexed",
    sessions: 11,
    chunks: 128,
    date: "Jun 19, 2025",
  },
  {
    title: "Competitive Battlecards — Gong vs ARAP.pdf",
    size: "780 KB",
    type: "PDF",
    status: "Indexed",
    sessions: 37,
    chunks: 562,
    date: "Jun 17, 2025",
  },
  {
    title: "Product-Led Growth Qualification Framework.docx",
    size: "2.2 MB",
    type: "DOCX",
    status: "Processing",
    sessions: 6,
    chunks: 221,
    date: "Jun 16, 2025",
  },
  {
    title: "Expansion Revenue Risk Matrix.pdf",
    size: "640 KB",
    type: "PDF",
    status: "Failed",
    sessions: 2,
    chunks: 0,
    date: "Jun 15, 2025",
  },
];

const typeClassName: Record<FileType, string> = {
  PDF: "border-amber-writing/30 bg-amber-writing/15 text-amber-writing",
  TXT: "border-blue-research/30 bg-blue-research/15 text-blue-research",
  MD: "border-green-active/30 bg-green-active/15 text-green-active",
  DOCX: "border-accent-primary/30 bg-accent-primary/15 text-accent-primary",
};

const statusClassName: Record<PlaybookStatus, string> = {
  Indexed: "border-green-active/30 bg-green-active/15 text-green-active",
  Processing:
    "border-blue-research/30 bg-blue-research/15 text-blue-research",
  Failed: "border-red-error/30 bg-red-error/15 text-red-error",
};

function StatusPill({ status }: { status: PlaybookStatus }) {
  const Icon =
    status === "Indexed"
      ? CheckCircle
      : status === "Processing"
        ? Loader2
        : XCircle;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-[11px] font-semibold ${statusClassName[status]}`}
    >
      <Icon
        className={`h-3 w-3 ${status === "Processing" ? "animate-spin" : ""}`}
      />
      {status}
    </span>
  );
}

function FileTypeBadge({ type }: { type: FileType }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold ${typeClassName[type]}`}
    >
      {type}
    </span>
  );
}

function PlaybookCard({ playbook }: { playbook: Playbook }) {
  const isProcessing = playbook.status === "Processing";
  const isFailed = playbook.status === "Failed";
  const progressWidth = isFailed
    ? "0%"
    : isProcessing
      ? "30%"
      : `${Math.min(100, Math.max(18, Math.round((playbook.chunks / 900) * 100)))}%`;
  const progressColor = isFailed
    ? "bg-red-error"
    : isProcessing
      ? "bg-blue-research"
      : "bg-green-active";
  const chunkColor = isProcessing ? "text-blue-research" : "text-green-active";

  return (
    <article className="cursor-pointer rounded-card border border-border-subtle bg-bg-surface p-5 transition-colors hover:border-border-active">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
          <FileText className="h-4 w-4" />
        </div>
        <h2 className="min-w-0 flex-1 overflow-hidden text-sm font-semibold leading-5 text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {playbook.title}
        </h2>
        <span className="mt-0.5 shrink-0 text-[11px] text-text-secondary">
          {playbook.size}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FileTypeBadge type={playbook.type} />
        <StatusPill status={playbook.status} />
        <span className="font-mono text-[11px] text-text-secondary">
          ×{playbook.sessions} sessions
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-secondary">
            Vector Chunks
          </span>
          <span className={`font-mono text-xs ${chunkColor}`}>
            {playbook.chunks}
          </span>
        </div>
        <div className="mt-1 h-1 rounded-full bg-bg-elevated">
          <div
            className={`h-1 rounded-full ${progressColor} ${
              isProcessing ? "animate-pulse" : ""
            }`}
            style={{ width: progressWidth }}
          />
        </div>
      </div>

      <footer className="mt-3 flex items-center gap-1.5 text-[11px] text-text-secondary">
        <Calendar className="h-2.5 w-2.5" />
        {playbook.date}
      </footer>
    </article>
  );
}

function FileChip({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`rounded border px-2.5 py-0.5 font-mono text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

export default function PlaybooksPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("All");

  // The one real network call on this page: uploadDocument() posts to the
  // Next.js /api/documents proxy, which forwards to the live
  // POST /api/v1/documents endpoint and gets back a real chunksQueued
  // count. The toast timers above are separate cosmetic-only UI state (not
  // driven by the actual upload's progress/completion).
  async function uploadFirstFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setToast({ filename: file.name, phase: "uploading" });
    window.setTimeout(() => {
      setToast({ filename: file.name, phase: "queued" });
    }, 1500);
    window.setTimeout(() => setToast(null), 3600);

    try {
      setUploadMessage(`Uploading ${file.name}...`);
      const result = await uploadDocument(file);
      setUploadMessage(`Queued ${result.chunksQueued} chunks from ${file.name}.`);
    } catch (error) {
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed",
      );
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    void uploadFirstFile(event.target.files);
    event.target.value = "";
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void uploadFirstFile(event.dataTransfer.files);
  }

  const filteredPlaybooks =
    activeFilter === "All"
      ? playbooks
      : playbooks.filter((playbook) => playbook.status === activeFilter);

  const filters: Array<{ label: string; value: ActiveFilter; dot?: string }> = [
    { label: "All 9", value: "All" },
    { label: "Indexed 7", value: "Indexed", dot: "text-green-active" },
    { label: "Processing 1", value: "Processing", dot: "text-blue-research" },
    { label: "Failed 1", value: "Failed", dot: "text-red-error" },
  ];

  return (
    <main className="min-h-screen bg-bg-base pt-[52px] text-text-primary">
      {toast ? (
        <div className="fixed right-6 top-[68px] z-50 rounded-lg border border-border-subtle bg-bg-surface px-4 py-3 shadow-lg">
          <div
            className={`flex items-center gap-2 text-sm ${
              toast.phase === "queued"
                ? "text-green-active"
                : "text-text-primary"
            }`}
          >
            {toast.phase === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            ) : (
              <CheckCircle className="h-4 w-4 text-green-active" />
            )}
            {toast.phase === "uploading"
              ? `Uploading ${toast.filename}...`
              : `${toast.filename} queued for embedding`}
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-[1200px] px-8 py-8">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md,.docx,text/plain,application/pdf"
          className="hidden"
          onChange={onFileChange}
        />

        <header className="flex items-start justify-between gap-8">
          <div>
            <h1 className="text-[28px] font-bold leading-tight text-text-primary">
              Sales Playbooks
            </h1>
            <p className="mt-1 max-w-lg text-sm leading-6 text-text-secondary">
              Upload and manage the documents your agents use for research and
              business-case generation. Indexed files are embedded into the
              vector store and retrieved at query time.
            </p>
          </div>

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-md bg-accent-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-glow"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </button>
        </header>

        <section
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-8 cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            dragging
              ? "border-accent-primary bg-accent-primary/5"
              : "border-border-active bg-bg-surface/50 hover:border-accent-primary hover:bg-accent-primary/5"
          }`}
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated">
            <UploadCloud className="h-10 w-10 text-accent-primary" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-text-primary">
            Drag & drop documents here
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            PDF, TXT, MD, DOCX · Max 50 MB per file · Files are chunked and
            embedded automatically
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <FileChip
              label=".pdf"
              className="border-amber-writing/40 text-amber-writing"
            />
            <FileChip
              label=".txt"
              className="border-blue-research/40 text-blue-research"
            />
            <FileChip
              label=".md"
              className="border-green-active/40 text-green-active"
            />
            <FileChip
              label=".docx"
              className="border-accent-primary/40 text-text-accent"
            />
          </div>
          {uploadMessage ? (
            <p className="mt-4 text-xs text-text-secondary">{uploadMessage}</p>
          ) : null}
        </section>

        <section className="mt-8 flex items-center justify-between gap-6">
          <div className="flex items-center gap-1">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setActiveFilter(filter.value)}
                className={
                  activeFilter === filter.value
                    ? "rounded-md bg-accent-primary px-3 py-1.5 text-sm font-medium text-white"
                    : "px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
                }
              >
                {filter.dot ? <span className={filter.dot}>● </span> : null}
                {filter.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[13px] text-text-secondary">Sort:</span>
            <button
              type="button"
              className="rounded-md border border-border-active bg-bg-elevated px-3 py-1.5 text-sm text-text-primary"
            >
              Date Indexed
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Name
            </button>
            <button
              type="button"
              className="px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Chunk Count
            </button>
          </div>
        </section>

        <section className="mt-6 grid grid-cols-3 gap-4">
          {filteredPlaybooks.map((playbook) => (
            <PlaybookCard key={playbook.title} playbook={playbook} />
          ))}
        </section>
      </div>
    </main>
  );
}
