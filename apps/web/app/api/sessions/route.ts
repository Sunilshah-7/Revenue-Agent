import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function GET() {
  const response = await fetch(`${backendUrl}/api/v1/sessions`, {
    cache: "no-store",
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}

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
