import { NextResponse } from "next/server";

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = params;

  // Placeholder response for player form endpoint
  return NextResponse.json({
    playerId: id,
    formScore: 0.8,
    recentInnings: [],
    message: "CricVeda player form endpoint stub.",
  });
}

