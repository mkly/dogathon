import { createGetRosterSyncJobHandler } from "@/lib/roster-sync-api";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };

const getRosterSyncJob = createGetRosterSyncJobHandler();

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json(
      { error: "Roster sync job not found" },
      { status: 404 },
    );
  }
  return getRosterSyncJob(request, id);
}
