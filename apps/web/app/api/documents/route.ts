// Next.js route handler proxying browser requests to the Hono API's
// documents endpoints. This same-origin indirection means the browser only
// ever talks to the Next.js server, never directly to the Railway backend
// — NEXT_PUBLIC_API_URL is read server-side here (falls back to loopback
// for local dev) rather than the browser needing to know the backend host.
import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Proxies GET /api/v1/documents (playbook inventory).
export async function GET() {
  const response = await fetch(`${backendUrl}/api/v1/documents`, {
    cache: "no-store",
  });
  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}

// Proxies POST /api/v1/documents. The incoming multipart FormData is read
// and re-sent as-is (not reconstructed field-by-field), so this forwards
// arbitrary upload payloads transparently.
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = await fetch(`${backendUrl}/api/v1/documents`, {
    method: "POST",
    body: formData,
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
