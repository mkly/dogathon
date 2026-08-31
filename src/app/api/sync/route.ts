import { NextResponse } from "next/server";

import { requireApiOrganization } from "@/lib/organization-access";
import { RosterSyncRefusal, syncRoster } from "@/lib/roster-sync";

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, ["owner", "admin"]);
  if (!access.ok) return access.response;

  try {
    return NextResponse.json(await syncRoster(access.context.orgId));
  } catch (error) {
    if (error instanceof RosterSyncRefusal) {
      return NextResponse.json(
        { refused: true, reason: error.reason },
        { status: 409 },
      );
    }
    console.error("Roster sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Roster sync failed" },
      { status: 500 },
    );
  }
}
