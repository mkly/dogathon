import { createGetRosterSyncJobHandler } from "@/lib/roster-sync-api";

type RouteContext = { params: Promise<{ id: string }> };

const getRosterSyncJob = createGetRosterSyncJobHandler();

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return getRosterSyncJob(request, id);
}
