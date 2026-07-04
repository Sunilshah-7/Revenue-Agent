// Typed frontend API calls — every function here calls a same-origin
// Next.js proxy route (/api/documents, /api/sessions, /api/sessions/:id),
// never the Hono backend directly. This keeps NEXT_PUBLIC_API_URL
// server-side-only in normal operation.
import type {
  DocumentRecord,
  SessionInput,
  SessionRecord,
  SessionResponse,
} from "../types";

// Resolves the base URL to fetch *this* Next.js app's own proxy routes
// from. In the browser, a relative path ("") is enough since fetch resolves
// against the current origin. Server-side (e.g. the RSC getSession() call
// in app/dashboard/[sessionId]/page.tsx) there is no implicit origin, so an
// absolute URL is built from NEXT_PUBLIC_APP_URL, then VERCEL_URL, then a
// localhost fallback — none of which are declared in the checked-in env
// examples yet per CLAUDE.md's Environment Variables Reference.
function apiBase(): string {
  if (typeof window !== "undefined") {
    return "";
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

export async function uploadDocument(
  file: File,
): Promise<{ documentId: string; chunksQueued: number; status: string }> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${apiBase()}/api/documents`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const response = await fetch(`${apiBase()}/api/documents`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = await response.json();
  return json.documents;
}

export async function startSession(
  payload: SessionInput,
): Promise<SessionResponse> {
  const response = await fetch(`${apiBase()}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Failed to start agent session");
  }

  return response.json();
}

export async function listSessions(): Promise<SessionRecord[]> {
  const response = await fetch(`${apiBase()}/api/sessions`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = await response.json();
  return json.sessions;
}

// Called server-side from app/dashboard/[sessionId]/page.tsx.
export async function getSession(id: string): Promise<SessionRecord> {
  const response = await fetch(`${apiBase()}/api/sessions/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
