import type { SessionDetail, SessionResponse } from "../types";

const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function uploadDocument(
  file: File,
): Promise<{ documentId: string; chunksQueued: number; status: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBase}/api/v1/documents`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function listDocuments(): Promise<
  Array<{ id: string; filename: string; created_at: string }>
> {
  const response = await fetch(`${apiBase}/api/v1/documents`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = await response.json();
  return json.documents;
}

export async function startSession(payload: {
  playbookId?: string;
  prospectContext: string;
}): Promise<SessionResponse> {
  const response = await fetch(`${apiBase}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function getSession(id: string): Promise<SessionDetail> {
  const response = await fetch(`${apiBase}/api/v1/sessions/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
