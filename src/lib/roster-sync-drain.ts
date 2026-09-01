import type { RosterSyncJob } from "@/generated/prisma/client";

import {
  claimRosterSyncJob,
  failRosterSyncJob,
  heartbeatRosterSyncJob,
  refuseRosterSyncJob,
  succeedRosterSyncJob,
} from "./roster-sync-jobs.ts";
import { RosterSyncRefusal, syncRoster, type SyncSummary } from "./roster-sync.ts";
import { isAuthorizedSchedulerRequest } from "./scheduler-auth.ts";

export const DEFAULT_ROSTER_SYNC_DRAIN_BUDGET_MS = 4 * 60 * 1000;
export const DEFAULT_ROSTER_SYNC_HEARTBEAT_MS = 30 * 1000;

type Claim = Pick<RosterSyncJob, "id" | "orgId" | "claimToken">;
type DrainJob = Pick<RosterSyncJob, "id" | "status" | "attempts">;

type DrainDependencies = {
  claim: (input: Record<string, never>) => Promise<Claim | null>;
  heartbeat: (input: LeaseInput) => Promise<unknown>;
  succeed: (input: LeaseInput & { summary: SyncSummary }) => Promise<DrainJob>;
  refuse: (input: LeaseInput & { reason: string }) => Promise<DrainJob>;
  fail: (input: LeaseInput & { error: string }) => Promise<DrainJob>;
  syncRoster: (orgId: string, options: { signal: AbortSignal }) => Promise<SyncSummary>;
};

type LeaseInput = {
  orgId: string;
  jobId: string;
  claimToken: string;
};

type DrainOptions = {
  budgetMs?: number;
  heartbeatMs?: number;
};

export type RosterSyncDrainResult =
  | { drained: false }
  | { drained: true; job: DrainJob };

const defaultDependencies: DrainDependencies = {
  claim: claimRosterSyncJob,
  heartbeat: heartbeatRosterSyncJob,
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
    const heartbeatMs = positiveDuration(
      options.heartbeatMs ?? DEFAULT_ROSTER_SYNC_HEARTBEAT_MS,
      "heartbeatMs",
    );
    const claimed = await dependencies.claim({});
    if (!claimed) return { drained: false };
    if (!claimed.claimToken) throw new Error(`Claimed roster sync job ${claimed.id} has no token`);

    const lease = {
      orgId: claimed.orgId,
      jobId: claimed.id,
      claimToken: claimed.claimToken,
    };
    const controller = new AbortController();
    const deadline = Date.now() + budgetMs;
    const execution = dependencies.syncRoster(claimed.orgId, { signal: controller.signal }).then(
      (summary) => ({ kind: "success" as const, summary }),
      (error: unknown) => ({ kind: "error" as const, error }),
    );

    while (true) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) return budgetExceeded();

      const outcome = await raceWithDelay(
        execution,
        Math.min(heartbeatMs, remainingMs),
      );
      if (outcome?.kind === "success") {
        return { drained: true, job: await dependencies.succeed({ ...lease, summary: outcome.summary }) };
      }
      if (outcome?.kind === "error") {
        if (outcome.error instanceof RosterSyncRefusal) {
          return {
            drained: true,
            job: await dependencies.refuse({ ...lease, reason: outcome.error.reason }),
          };
        }
        return {
          drained: true,
          job: await dependencies.fail({ ...lease, error: errorMessage(outcome.error) }),
        };
      }
      if (Date.now() >= deadline) return budgetExceeded();
      try {
        await dependencies.heartbeat(lease);
      } catch (error) {
        controller.abort(error);
        throw error;
      }
    }

    async function budgetExceeded(): Promise<RosterSyncDrainResult> {
      controller.abort(new Error("Roster sync drain budget exceeded"));
      const job = await dependencies.fail({
        ...lease,
        error: `Roster sync exceeded its ${budgetMs}ms drain budget`,
      });
      return { drained: true, job };
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
      const budgetMs = configuredBudget(env.ROSTER_SYNC_DRAIN_BUDGET_MS);
      return Response.json(await drain({ budgetMs }));
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

function raceWithDelay<T>(promise: Promise<T>, milliseconds: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), milliseconds);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
