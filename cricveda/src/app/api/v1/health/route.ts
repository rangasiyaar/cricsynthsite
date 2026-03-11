import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "cricveda",
    timestamp: new Date().toISOString(),
  });
}

