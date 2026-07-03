// Proxies GET /api/v1/sessions/:id. This is the one session proxy route
// that IS actually consumed today — by lib/api.ts's getSession(), called
// server-side from app/dashboard/[sessionId]/page.tsx.
import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const response = await fetch(`${backendUrl}/api/v1/sessions/${params.id}`, {
    cache: "no-store",
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
