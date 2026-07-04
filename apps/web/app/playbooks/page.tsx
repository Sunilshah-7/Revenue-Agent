"use client";

// Playbooks screen ("/playbooks") — upload and inventory are both wired to
// the real backend: uploadDocument() posts to POST /api/v1/documents, and
// the grid below renders GET /api/v1/documents results directly. The
// backend document schema only stores { id, filename, created_at }, so no
// file size/type/status/chunk/session counts are shown — none of that
// exists server-side.
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { Calendar, FileText, Loader2, Upload, UploadCloud } from "lucide-react";
import { listDocuments, uploadDocument } from "../../lib/api";
import { formatRelativeTime } from "../../lib/format";
import type { DocumentRecord } from "../../types";

type ToastState = { filename: string; phase: "uploading" | "queued" } | null;

function extensionOf(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) {
    return "FILE";
  }
  return parts[parts.length - 1]!.toUpperCase();
}

function DocumentCard({ document }: { document: DocumentRecord }) {
  return (
    <article className="rounded-card border border-border-subtle bg-bg-surface p-5 transition-colors hover:border-border-active">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-bg-elevated text-text-secondary">
          <FileText className="h-4 w-4" />
        </div>
        <h2 className="min-w-0 flex-1 overflow-hidden text-sm font-semibold leading-5 text-text-primary [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
          {document.filename}
        </h2>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="rounded border border-accent-primary/40 px-1.5 py-0.5 font-mono text-[10px] font-bold text-text-accent">
          {extensionOf(document.filename)}
        </span>
      </div>

      <footer className="mt-4 flex items-center gap-1.5 text-[11px] text-text-secondary">
        <Calendar className="h-2.5 w-2.5" />
        {formatRelativeTime(document.created_at)}
      </footer>
    </article>
  );
}

export default function PlaybooksPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await listDocuments();
      setDocuments(result);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to reach the backend",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function uploadFirstFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) {
      return;
    }

    setToast({ filename: file.name, phase: "uploading" });

    try {
      setUploadMessage(`Uploading ${file.name}...`);
      const result = await uploadDocument(file);
      setUploadMessage(`Queued ${result.chunksQueued} chunks from ${file.name}.`);
      setToast({ filename: file.name, phase: "queued" });
      await refresh();
    } catch (error) {
      setToast(null);
      setUploadMessage(
        error instanceof Error ? error.message : "Upload failed",
      );
    } finally {
      window.setTimeout(() => setToast(null), 3600);
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

  return (
    <main className="min-h-screen bg-bg-base pt-[52px] text-text-primary">
      {toast ? (
        <div className="fixed right-6 top-[68px] z-50 rounded-lg border border-border-subtle bg-bg-surface px-4 py-3 shadow-lg">
          <div
            className={`flex items-center gap-2 text-sm ${
              toast.phase === "queued" ? "text-green-active" : "text-text-primary"
            }`}
          >
            {toast.phase === "uploading" ? (
              <Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
            ) : (
              <FileText className="h-4 w-4 text-green-active" />
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
          accept=".pdf,.txt,text/plain,application/pdf"
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

        {loadError ? (
          <p className="mt-4 rounded-md border border-red-error/30 bg-red-error/10 px-3 py-2 text-xs text-red-error">
            {loadError}
          </p>
        ) : null}

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
            PDF or TXT · Files are chunked and embedded automatically
          </p>
          {uploadMessage ? (
            <p className="mt-4 text-xs text-text-secondary">{uploadMessage}</p>
          ) : null}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.2em] text-text-secondary">
            {documents.length} Indexed Document{documents.length === 1 ? "" : "s"}
          </h2>

          {documents.length === 0 ? (
            <p className="text-sm text-text-secondary">
              No documents indexed yet — upload one above.
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {documents.map((document) => (
                <DocumentCard key={document.id} document={document} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
