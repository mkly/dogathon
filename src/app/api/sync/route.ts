import { NextResponse } from "next/server";

import { requireApiSession } from "@/lib/auth-session";
import { syncRoster } from "@/lib/roster-sync";

export async function POST(request: Request) {
  const unauthorized = await requireApiSession(request.headers);
  if (unauthorized) return unauthorized;

  try {
    return NextResponse.json(await syncRoster());
  } catch (error) {
    console.error("Roster sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Roster sync failed" },
      { status: 500 },
    );
  }
}
