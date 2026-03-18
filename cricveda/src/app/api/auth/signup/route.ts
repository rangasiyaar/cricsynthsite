import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  // Placeholder signup logic
  return NextResponse.json(
    {
      message: "Signup endpoint stub. Implement user creation and onboarding.",
      received: body ?? {},
    },
    { status: 201 }
  );
}

