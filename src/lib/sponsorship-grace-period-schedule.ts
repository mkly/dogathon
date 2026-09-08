import { env as appEnv } from "./env.ts";
import { prisma } from "./prisma.ts";
import { enqueueSponsorshipGracePeriodJob } from "./roster-sync-queue.ts";
import { isAuthorizedSchedulerRequest, type SchedulerEnvironment } from "./scheduler-auth.ts";

type ScheduleDependencies = {
  enqueue?: (orgId: string) => Promise<string | null>;
  env?: SchedulerEnvironment;
  listOrganizations?: () => Promise<Array<{ id: string }>>;
};

export function createSponsorshipGracePeriodScheduleHandler(
  dependencies: ScheduleDependencies = {},
) {
  const enqueue = dependencies.enqueue ?? enqueueSponsorshipGracePeriodJob;
  const environment = dependencies.env ?? appEnv;
  const listOrganizations = dependencies.listOrganizations
    ?? (() => prisma.organization.findMany({ orderBy: { id: "asc" }, select: { id: true } }));

  return async function GET(request: Request): Promise<Response> {
    if (!isAuthorizedSchedulerRequest(request, environment)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      const organizations = await listOrganizations();
      let enqueued = 0;
      let skipped = 0;
      let failed = 0;

      for (const organization of organizations) {
        try {
          if (await enqueue(organization.id)) enqueued += 1;
          else skipped += 1;
        } catch (error) {
          failed += 1;
          console.error(
            `Could not schedule sponsorship grace period for organization ${organization.id}`,
            error,
          );
        }
      }

      return Response.json({ eligible: organizations.length, enqueued, skipped, failed });
    } catch (error) {
      console.error("Sponsorship grace-period scheduling failed", error);
      return Response.json({ error: "Sponsorship grace-period scheduling failed" }, { status: 500 });
    }
  };
}
