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
