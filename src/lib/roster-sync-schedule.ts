import { prisma } from "./prisma.ts";
import {
  enqueueRosterSyncJobWithResult,
  type EnqueueRosterSyncJobResult,
} from "./roster-sync-queue.ts";
import { isAuthorizedSchedulerRequest, type SchedulerEnvironment } from "./scheduler-auth.ts";
import { env as appEnv } from "./env.ts";

const DEFAULT_ROSTER_SYNC_STAGGER_MS = 5 * 60 * 1000;

type ScheduledOrganization = { orgId: string };
type ScheduledEnqueue = (input: {
  orgId: string;
  trigger: "scheduled";
  startAfter: Date;
}) => Promise<EnqueueRosterSyncJobResult>;

type ScheduleDependencies = {
  listOrganizations?: () => Promise<ScheduledOrganization[]>;
  enqueue?: ScheduledEnqueue;
  env?: SchedulerEnvironment;
  now?: () => Date;
};

export function createRosterSyncScheduleHandler(dependencies: ScheduleDependencies = {}) {
  const listOrganizations = dependencies.listOrganizations ?? defaultOrganizations;
  const enqueue = dependencies.enqueue ?? enqueueRosterSyncJobWithResult;
  const environment = dependencies.env ?? appEnv;
  const now = dependencies.now ?? (() => new Date());

  return async function GET(request: Request): Promise<Response> {
    if (!isAuthorizedSchedulerRequest(request, environment)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const startedAt = now();
      const organizations = await listOrganizations();
      let enqueued = 0;
      let skipped = 0;
      let failed = 0;

      for (const [index, organization] of organizations.entries()) {
        try {
          const result = await enqueue({
            orgId: organization.orgId,
            trigger: "scheduled",
            startAfter: new Date(
              startedAt.getTime() + index * DEFAULT_ROSTER_SYNC_STAGGER_MS,
            ),
          });
          if (result.enqueued) enqueued += 1;
          else skipped += 1;
        } catch (error) {
          failed += 1;
          console.error(`Could not schedule roster sync for organization ${organization.orgId}`, error);
        }
      }

      return Response.json({ eligible: organizations.length, enqueued, skipped, failed });
    } catch (error) {
      console.error("Roster sync scheduling failed", error);
      return Response.json({ error: "Roster sync scheduling failed" }, { status: 500 });
    }
  };
}

async function defaultOrganizations(): Promise<ScheduledOrganization[]> {
  return prisma.rescueSettings.findMany({
    where: { sourceUrl: { not: "" } },
    orderBy: { orgId: "asc" },
    select: { orgId: true },
  });
}
