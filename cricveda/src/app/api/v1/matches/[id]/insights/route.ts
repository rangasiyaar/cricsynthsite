import { NextResponse } from "next/server";

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = params;

  // Placeholder response for match insights endpoint
  return NextResponse.json({
    matchId: id,
    insights: [],
    message: "CricVeda match insights endpoint stub.",
  });
}

