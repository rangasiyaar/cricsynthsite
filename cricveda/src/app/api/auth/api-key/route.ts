import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Simple fake API key for now
  const fakeKey = "cv_test_" + Math.random().toString(36).slice(2, 10);

  return NextResponse.json(
    {
      message: "API key generation stub. Replace with real secure key logic.",
      apiKey: fakeKey,
      received: body ?? {},
    },
    { status: 201 }
  );
}

