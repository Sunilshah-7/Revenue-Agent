import { NextRequest, NextResponse } from "next/server";

const backendUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export async function GET() {
  const response = await fetch(`${backendUrl}/api/v1/documents`, {
    cache: "no-store",
  });
  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const response = await fetch(`${backendUrl}/api/v1/documents`, {
    method: "POST",
    body: formData,
  });

  const json = await response.json();
  return NextResponse.json(json, { status: response.status });
}
