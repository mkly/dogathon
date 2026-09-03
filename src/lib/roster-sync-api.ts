import { requireApiOrganization } from "./organization-access.ts";
import {
  enqueueRosterSyncJob,
  getRosterSyncJob,
  RosterSyncJobNotFoundError,
} from "./roster-sync-queue.ts";
import type { RosterSyncJobView } from "./roster-sync-client.ts";

export type RosterSyncJobResponse = RosterSyncJobView;

type OrganizationAccess = Awaited<ReturnType<typeof requireApiOrganization>>;
type Authorize = (
  headers: Headers,
  roles: readonly ["owner", "admin"],
) => Promise<OrganizationAccess>;

type Dependencies = {
  authorize: Authorize;
  enqueue: typeof enqueueRosterSyncJob;
  get: typeof getRosterSyncJob;
};

const defaultDependencies: Dependencies = {
  authorize: requireApiOrganization,
  enqueue: enqueueRosterSyncJob,
  get: getRosterSyncJob,
};

export function createEnqueueRosterSyncHandler(
  dependencies: Pick<Dependencies, "authorize" | "enqueue"> = defaultDependencies,
) {
  return async function POST(request: Request) {
    const access = await dependencies.authorize(request.headers, ["owner", "admin"]);
    if (!access.ok) return access.response;

    const job = await dependencies.enqueue({
      orgId: access.context.orgId,
      requestedByUserId: access.context.userId,
    });

    return Response.json(publicJob(job), { status: 202 });
  };
}

export function createGetRosterSyncJobHandler(
  dependencies: Pick<Dependencies, "authorize" | "get"> = defaultDependencies,
) {
  return async function GET(request: Request, jobId: string) {
    const access = await dependencies.authorize(request.headers, ["owner", "admin"]);
    if (!access.ok) return access.response;

    try {
      return Response.json(publicJob(await dependencies.get(access.context.orgId, jobId)));
    } catch (error) {
      if (error instanceof RosterSyncJobNotFoundError) {
        return Response.json({ error: "Roster sync job not found" }, { status: 404 });
      }
      throw error;
    }
  };
}

function publicJob(job: RosterSyncJobView): RosterSyncJobResponse {
  return job;
}
