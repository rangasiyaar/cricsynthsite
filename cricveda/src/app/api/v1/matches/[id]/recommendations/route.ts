import { NextResponse } from "next/server";

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: Request, { params }: RouteParams) {
  const { id } = params;

  // Placeholder response for fantasy recommendations endpoint
  return NextResponse.json({
    matchId: id,
    recommendations: {
      captain: null,
      viceCaptain: null,
      tiers: [],
    },
    message: "CricVeda fantasy recommendations endpoint stub.",
  });
}

