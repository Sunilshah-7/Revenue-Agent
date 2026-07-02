// Typed frontend API calls (per the Key Files Map) — every function here
// calls a same-origin Next.js proxy route (/api/documents, /api/sessions,
// /api/sessions/:id), never the Hono backend directly. This is what keeps
// NEXT_PUBLIC_API_URL server-side-only in normal operation.
import type { SessionDetail, SessionResponse } from "../types";

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

// Not currently called from any page — the Playbooks screen's grid still
// renders seeded data instead of using this.
export async function listDocuments(): Promise<
  Array<{ id: string; filename: string; created_at: string }>
> {
  const response = await fetch(`${apiBase()}/api/documents`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const json = await response.json();
  return json.documents;
}

// Not currently called from any page either — the Dashboard's onSubmit
// still fabricates a client-side UUID instead of using this to create a
// real session.
export async function startSession(payload: {
  playbookId?: string;
  prospectContext: string;
}): Promise<SessionResponse> {
  const response = await fetch(`${apiBase()}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

// The one function in this file that IS actually used — called server-side
// from app/dashboard/[sessionId]/page.tsx.
export async function getSession(id: string): Promise<SessionDetail> {
  const response = await fetch(`${apiBase()}/api/sessions/${id}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
