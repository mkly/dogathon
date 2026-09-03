import {
  failRosterSyncJob,
  fetchRosterSyncJob,
  refuseRosterSyncJob,
  succeedRosterSyncJob,
  type ClaimedRosterSyncJob,
} from "./roster-sync-queue.ts";
import type { RosterSyncJobView } from "./roster-sync-client.ts";
import { RosterSyncRefusal, syncRoster, type SyncSummary } from "./roster-sync.ts";
import { isAuthorizedSchedulerRequest } from "./scheduler-auth.ts";

export const DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS = 4 * 60 * 1000;

type DrainDependencies = {
  fetch: () => Promise<ClaimedRosterSyncJob | null>;
  succeed: (jobId: string, summary: SyncSummary) => Promise<RosterSyncJobView>;
  refuse: (jobId: string, reason: string) => Promise<RosterSyncJobView>;
  fail: (jobId: string, error: string) => Promise<RosterSyncJobView>;
  syncRoster: (orgId: string, options: { signal: AbortSignal }) => Promise<SyncSummary>;
};

type DrainOptions = { budgetMs?: number };

export type RosterSyncDrainResult =
  | { drained: false }
  | { drained: true; job: RosterSyncJobView };

const defaultDependencies: DrainDependencies = {
  fetch: fetchRosterSyncJob,
  succeed: succeedRosterSyncJob,
  refuse: refuseRosterSyncJob,
  fail: failRosterSyncJob,
  syncRoster,
};

export function createRosterSyncDrainer(dependencies: DrainDependencies = defaultDependencies) {
  return async function drain(options: DrainOptions = {}): Promise<RosterSyncDrainResult> {
    const budgetMs = positiveDuration(
      options.budgetMs ?? DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS,
      "budgetMs",
    );
    const claimed = await dependencies.fetch();
    if (!claimed) return { drained: false };

    const budgetSignal = AbortSignal.timeout(budgetMs);
    const signal = claimed.signal
      ? AbortSignal.any([claimed.signal, budgetSignal])
      : budgetSignal;
    try {
      const summary = await dependencies.syncRoster(claimed.data.orgId, { signal });
      return { drained: true, job: await dependencies.succeed(claimed.id, summary) };
    } catch (error) {
      if (error instanceof RosterSyncRefusal) {
        return { drained: true, job: await dependencies.refuse(claimed.id, error.reason) };
      }
      const message = budgetSignal.aborted
        ? `Roster sync exceeded its ${budgetMs}ms drain budget`
        : errorMessage(error);
      return { drained: true, job: await dependencies.fail(claimed.id, message) };
    }
  };
}

type DrainRouteDependencies = {
  drain?: ReturnType<typeof createRosterSyncDrainer>;
  env?: Record<string, string | undefined>;
};

export function createRosterSyncDrainHandler(dependencies: DrainRouteDependencies = {}) {
  const drain = dependencies.drain ?? createRosterSyncDrainer();
  const env = dependencies.env ?? process.env;

  return async function POST(request: Request): Promise<Response> {
    if (!isAuthorizedSchedulerRequest(request, env)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
      return Response.json(await drain({
        budgetMs: configuredBudget(env.ROSTER_SYNC_DRAIN_BUDGET_MS),
      }));
    } catch (error) {
      console.error("Roster sync drain failed", error);
      return Response.json({ error: "Roster sync drain failed" }, { status: 500 });
    }
  };
}

function configuredBudget(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS;
  return positiveDuration(Number(value), "ROSTER_SYNC_DRAIN_BUDGET_MS");
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
