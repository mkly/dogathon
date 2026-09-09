import {
  failRosterSyncJob,
  fetchRosterSyncJob,
  refuseRosterSyncJob,
  succeedRosterSyncJob,
  superviseRosterSyncQueue,
  type ClaimedRosterSyncJob,
  completeVolunteerPhotoCleanupJob,
  enqueueVolunteerPhotoCleanupJob,
  failVolunteerPhotoCleanupJob,
  fetchVolunteerPhotoCleanupJob,
} from "./roster-sync-queue.ts";
import type { RosterSyncJobView } from "./roster-sync-client.ts";
import { prisma } from "./prisma.ts";
import {
  RosterSyncRefusal,
  syncRoster,
  type SyncSummary,
} from "./roster-sync.ts";
import { isAuthorizedSchedulerRequest } from "./scheduler-auth.ts";
import { env as appEnv } from "./env.ts";
import type { SchedulerEnvironment } from "./scheduler-auth.ts";
import { cleanupVolunteerPhotos } from "./volunteer-photo-cleanup.ts";

const DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS = 4 * 60 * 1000;
const ORGANIZATION_REMOVED_REASON = "Organization no longer exists";

type DrainDependencies = {
  supervise: () => Promise<void>;
  fetch: () => Promise<ClaimedRosterSyncJob | null>;
  organizationExists: (orgId: string) => Promise<boolean>;
  succeed: (jobId: string, summary: SyncSummary) => Promise<RosterSyncJobView>;
  refuse: (jobId: string, reason: string) => Promise<RosterSyncJobView>;
  fail: (jobId: string, error: string) => Promise<RosterSyncJobView>;
  syncRoster: (
    orgId: string,
    options: { signal: AbortSignal },
  ) => Promise<SyncSummary>;
};

type DrainOptions = { budgetMs?: number };

export type RosterSyncDrainResult =
  { drained: false } | { drained: true; job: RosterSyncJobView };

const defaultDependencies: DrainDependencies = {
  supervise: superviseRosterSyncQueue,
  fetch: fetchRosterSyncJob,
  organizationExists: async (orgId) =>
    Boolean(
      await prisma.organization.findUnique({
        where: { id: orgId },
        select: { id: true },
      }),
    ),
  succeed: succeedRosterSyncJob,
  refuse: refuseRosterSyncJob,
  fail: failRosterSyncJob,
  syncRoster,
};

export function createRosterSyncDrainer(
  dependencies: DrainDependencies = defaultDependencies,
) {
  return async function drain(
    options: DrainOptions = {},
  ): Promise<RosterSyncDrainResult> {
    const budgetMs = positiveDuration(
      options.budgetMs ?? DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS,
      "budgetMs",
    );
    await dependencies.supervise();
    const claimed = await dependencies.fetch();
    if (!claimed) return { drained: false };
    if (!(await dependencies.organizationExists(claimed.data.orgId))) {
      return {
        drained: true,
        job: await dependencies.refuse(claimed.id, ORGANIZATION_REMOVED_REASON),
      };
    }

    const budgetSignal = AbortSignal.timeout(budgetMs);
    const signal = claimed.signal
      ? AbortSignal.any([claimed.signal, budgetSignal])
      : budgetSignal;
    try {
      const summary = await dependencies.syncRoster(claimed.data.orgId, {
        signal,
      });
      return {
        drained: true,
        job: await dependencies.succeed(claimed.id, summary),
      };
    } catch (error) {
      if (error instanceof RosterSyncRefusal) {
        return {
          drained: true,
          job: await dependencies.refuse(claimed.id, error.reason),
        };
      }
      const message = budgetSignal.aborted
        ? `Roster sync exceeded its ${budgetMs}ms drain budget`
        : errorMessage(error);
      return {
        drained: true,
        job: await dependencies.fail(claimed.id, message),
      };
    }
  };
}

type PhotoCleanupDependencies = {
  cleanup?: () => Promise<{ deleted: number }>;
  complete?: (jobId: string) => Promise<void>;
  enqueue?: () => Promise<string | null>;
  fail?: (jobId: string, error: string) => Promise<void>;
  fetch?: () => Promise<{ id: string } | null>;
};

const photoCleanupDefaults: Required<PhotoCleanupDependencies> = {
  cleanup: cleanupVolunteerPhotos,
  complete: completeVolunteerPhotoCleanupJob,
  enqueue: enqueueVolunteerPhotoCleanupJob,
  fail: failVolunteerPhotoCleanupJob,
  fetch: fetchVolunteerPhotoCleanupJob,
};

export function createVolunteerPhotoCleanupDrainer(
  dependencies: PhotoCleanupDependencies = {},
) {
  const services = { ...photoCleanupDefaults, ...dependencies };
  return async function drain() {
    await services.enqueue();
    const job = await services.fetch();
    if (!job) return { drained: false as const };
    try {
      const result = await services.cleanup();
      await services.complete(job.id);
      return { drained: true as const, ...result };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Volunteer photo cleanup failed";
      await services.fail(job.id, message);
      throw error;
    }
  };
}

type DrainRouteDependencies = {
  drain?: ReturnType<typeof createRosterSyncDrainer>;
  env?: SchedulerEnvironment;
};

export function createRosterSyncDrainHandler(
  dependencies: DrainRouteDependencies = {},
) {
  const drain = dependencies.drain ?? createRosterSyncDrainer();
  const environment = dependencies.env ?? appEnv;

  return async function POST(request: Request): Promise<Response> {
    if (!isAuthorizedSchedulerRequest(request, environment)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      return Response.json(
        await drain({
          budgetMs: DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS,
        }),
      );
    } catch (error) {
      console.error("Roster sync drain failed", error);
      return Response.json(
        { error: "Roster sync drain failed" },
        { status: 500 },
      );
    }
  };
}

function positiveDuration(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive number of milliseconds`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Roster sync failed";
}
