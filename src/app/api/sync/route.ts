import { NextResponse } from "next/server";

import { syncRoster } from "@/lib/roster-sync";

export async function POST() {
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
