// Same-origin proxy pattern as app/api/documents/route.ts, for the
// sessions collection endpoints. Note: as of CLAUDE.md, the Dashboard page
// doesn't actually call either handler yet — this proxy exists and works,
// but isn't wired into the seeded dashboard UI.
import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Proxies GET /api/v1/sessions.
export async function GET() {
  const response = await fetch(`${backendUrl}/api/v1/sessions`, {
    cache: "no-store",
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}

// Proxies POST /api/v1/sessions (starts a new agent run).
export async function POST(request: NextRequest) {
  const body = await request.json();

  const response = await fetch(`${backendUrl}/api/v1/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
