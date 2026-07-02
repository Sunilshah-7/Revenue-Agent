"use client";

// Minimal, fully-live upload control (no fixtures) — a simpler alternative
// to the Playbooks screen's own inline drag-and-drop uploader, sharing the
// same uploadDocument() call.
import { useState } from "react";
import { uploadDocument } from "../lib/api";

export function PlaybookUploader() {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("Upload a PDF or TXT playbook.");

  const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setUploading(true);
      const result = await uploadDocument(file);
      setMessage(`Queued ${result.chunksQueued} chunks from ${file.name}.`);
      event.target.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="card grid">
      <h3>Ingest Sales Playbook</h3>
      <input
        type="file"
        accept=".pdf,.txt,text/plain,application/pdf"
        onChange={onFileChange}
        disabled={uploading}
      />
      <p>{message}</p>
    </div>
  );
}
