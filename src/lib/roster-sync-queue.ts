import { PgBoss, type Job, type JobWithMetadata } from "pg-boss";

import type { RosterSyncJobView } from "./roster-sync-client.ts";
import { env } from "./env.ts";
import type { SyncSummary } from "./roster-sync.ts";

export const ROSTER_SYNC_QUEUE = "roster-sync";
export const VOLUNTEER_PHOTO_CLEANUP_QUEUE = "volunteer-photo-cleanup";
export const ROSTER_SYNC_RETRY_LIMIT = 3;
export const ROSTER_SYNC_EXPIRE_SECONDS = 5 * 60;

export type RosterSyncJobData = {
  orgId: string;
  requestedByUserId?: string;
  trigger: "admin" | "scheduled";
};

type RosterSyncJobOutput = {
  status?: "succeeded" | "refused" | "failed";
  summary?: SyncSummary;
  refusalReason?: string;
  errorMessage?: string;
};

export type EnqueueRosterSyncJobInput = {
  orgId: string;
  requestedByUserId?: string;
  trigger?: "admin" | "scheduled";
  startAfter?: Date;
};

export type EnqueueRosterSyncJobResult = {
  job: RosterSyncJobView;
  enqueued: boolean;
};

export type ClaimedRosterSyncJob = Omit<Job<RosterSyncJobData>, "signal"> & {
  signal?: AbortSignal;
};

type RosterSyncBoss = Pick<
  PgBoss,
  "send" | "update" | "fetch" | "complete" | "fail" | "getJobById" | "findJobs"
>;

const globalForRosterSync = globalThis as unknown as {
  rosterSyncBoss?: PgBoss;
  rosterSyncBossStart?: Promise<PgBoss>;
};

export class RosterSyncJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Roster sync job ${jobId} was not found`);
    this.name = "RosterSyncJobNotFoundError";
  }
}

async function getRosterSyncBoss(): Promise<PgBoss> {
  if (!globalForRosterSync.rosterSyncBossStart) {
    const boss =
      globalForRosterSync.rosterSyncBoss ??
      new PgBoss({
        connectionString: env.DATABASE_URL,
        supervise: false,
        schedule: false,
      });
    boss.on("error", (error) => console.error("pg-boss error", error));
    globalForRosterSync.rosterSyncBoss = boss;
    globalForRosterSync.rosterSyncBossStart = boss
      .start()
      .then(async () => {
        await boss.createQueue(ROSTER_SYNC_QUEUE, {
          policy: "exclusive",
          retryLimit: ROSTER_SYNC_RETRY_LIMIT,
          expireInSeconds: ROSTER_SYNC_EXPIRE_SECONDS,
        });
        await boss.createQueue(VOLUNTEER_PHOTO_CLEANUP_QUEUE, {
          retryLimit: ROSTER_SYNC_RETRY_LIMIT,
          expireInSeconds: ROSTER_SYNC_EXPIRE_SECONDS,
        });
        return boss;
      })
      .catch((error) => {
        globalForRosterSync.rosterSyncBossStart = undefined;
        throw error;
      });
  }
  return globalForRosterSync.rosterSyncBossStart;
}

export function createRosterSyncQueue(boss: RosterSyncBoss) {
  async function enqueueWithResult(
    input: EnqueueRosterSyncJobInput,
  ): Promise<EnqueueRosterSyncJobResult> {
    const data: RosterSyncJobData = {
      orgId: input.orgId,
      requestedByUserId: input.requestedByUserId,
      trigger: input.trigger ?? "admin",
    };
    const id = await boss.send(ROSTER_SYNC_QUEUE, data, {
      singletonKey: input.orgId,
      retryLimit: ROSTER_SYNC_RETRY_LIMIT,
      expireInSeconds: ROSTER_SYNC_EXPIRE_SECONDS,
      startAfter: input.startAfter,
    });

    if (id)
      return {
        job: publicRosterSyncJob(await requireJob(boss, id)),
        enqueued: true,
      };

    // A manual request should not remain behind the nightly stagger. pg-boss
    // only updates pre-active jobs here; an already-active sync is untouched.
    if (data.trigger === "admin") {
      await boss.update(ROSTER_SYNC_QUEUE, undefined, {
        singletonKey: input.orgId,
        startAfter: new Date(),
      });
    }

    const existing = (
      await boss.findJobs<RosterSyncJobData>(ROSTER_SYNC_QUEUE, {
        key: input.orgId,
      })
    ).find(
      (job) =>
        job.state === "created" ||
        job.state === "retry" ||
        job.state === "active",
    );
    if (!existing) {
      throw new Error(
        `Roster sync singleton ${input.orgId} disappeared after enqueue`,
      );
    }
    return { job: publicRosterSyncJob(existing), enqueued: false };
  }

  async function enqueue(
    input: EnqueueRosterSyncJobInput,
  ): Promise<RosterSyncJobView> {
    return (await enqueueWithResult(input)).job;
  }

  async function get(orgId: string, jobId: string): Promise<RosterSyncJobView> {
    const job = await boss.getJobById<RosterSyncJobData>(
      ROSTER_SYNC_QUEUE,
      jobId,
    );
    if (!job || job.data.orgId !== orgId)
      throw new RosterSyncJobNotFoundError(jobId);
    return publicRosterSyncJob(job);
  }

  async function fetch(): Promise<ClaimedRosterSyncJob | null> {
    return (await boss.fetch<RosterSyncJobData>(ROSTER_SYNC_QUEUE))[0] ?? null;
  }

  async function succeed(
    jobId: string,
    summary: SyncSummary,
  ): Promise<RosterSyncJobView> {
    await boss.complete(ROSTER_SYNC_QUEUE, jobId, {
      status: "succeeded",
      summary,
    });
    return publicRosterSyncJob(await requireJob(boss, jobId));
  }

  async function refuse(
    jobId: string,
    refusalReason: string,
  ): Promise<RosterSyncJobView> {
    await boss.complete(ROSTER_SYNC_QUEUE, jobId, {
      status: "refused",
      refusalReason,
    });
    return publicRosterSyncJob(await requireJob(boss, jobId));
  }

  async function fail(
    jobId: string,
    errorMessage: string,
  ): Promise<RosterSyncJobView> {
    await boss.fail(ROSTER_SYNC_QUEUE, jobId, {
      status: "failed",
      errorMessage,
    });
    return publicRosterSyncJob(await requireJob(boss, jobId));
  }

  return { enqueue, enqueueWithResult, get, fetch, succeed, refuse, fail };
}

async function requireJob(boss: RosterSyncBoss, jobId: string) {
  const job = await boss.getJobById<RosterSyncJobData>(
    ROSTER_SYNC_QUEUE,
    jobId,
  );
  if (!job) throw new RosterSyncJobNotFoundError(jobId);
  return job;
}

function publicRosterSyncJob(
  job: JobWithMetadata<RosterSyncJobData>,
): RosterSyncJobView {
  const output = (job.output ?? {}) as RosterSyncJobOutput;
  const status =
    output.status === "refused"
      ? "refused"
      : job.state === "completed"
        ? "succeeded"
        : job.state === "failed" || job.state === "cancelled"
          ? "failed"
          : job.state === "active"
            ? "running"
            : "queued";

  return {
    id: job.id,
    status,
    trigger: job.data.trigger,
    summary: output.summary ?? null,
    refusalReason: output.refusalReason ?? null,
    errorMessage: output.errorMessage ?? null,
  };
}

async function defaultQueue() {
  return createRosterSyncQueue(await getRosterSyncBoss());
}

export async function enqueueRosterSyncJob(input: EnqueueRosterSyncJobInput) {
  return (await defaultQueue()).enqueue(input);
}

export async function enqueueRosterSyncJobWithResult(
  input: EnqueueRosterSyncJobInput,
) {
  return (await defaultQueue()).enqueueWithResult(input);
}

export async function getRosterSyncJob(orgId: string, jobId: string) {
  return (await defaultQueue()).get(orgId, jobId);
}

export async function fetchRosterSyncJob() {
  return (await defaultQueue()).fetch();
}

export async function superviseRosterSyncQueue() {
  await (await getRosterSyncBoss()).supervise(ROSTER_SYNC_QUEUE);
}

export async function succeedRosterSyncJob(
  jobId: string,
  summary: SyncSummary,
) {
  return (await defaultQueue()).succeed(jobId, summary);
}

export async function refuseRosterSyncJob(jobId: string, reason: string) {
  return (await defaultQueue()).refuse(jobId, reason);
}

export async function failRosterSyncJob(jobId: string, error: string) {
  return (await defaultQueue()).fail(jobId, error);
}

export async function enqueueVolunteerPhotoCleanupJob() {
  return (await getRosterSyncBoss()).send(
    VOLUNTEER_PHOTO_CLEANUP_QUEUE,
    {},
    {
      singletonKey: "daily-cleanup",
      singletonSeconds: 24 * 60 * 60,
      retryLimit: ROSTER_SYNC_RETRY_LIMIT,
      expireInSeconds: ROSTER_SYNC_EXPIRE_SECONDS,
    },
  );
}

export async function fetchVolunteerPhotoCleanupJob() {
  return (await getRosterSyncBoss())
    .fetch<Record<string, never>>(VOLUNTEER_PHOTO_CLEANUP_QUEUE)
    .then((jobs) => jobs[0] ?? null);
}

export async function completeVolunteerPhotoCleanupJob(jobId: string) {
  await (
    await getRosterSyncBoss()
  ).complete(VOLUNTEER_PHOTO_CLEANUP_QUEUE, jobId);
}

export async function failVolunteerPhotoCleanupJob(
  jobId: string,
  error: string,
) {
  await (
    await getRosterSyncBoss()
  ).fail(VOLUNTEER_PHOTO_CLEANUP_QUEUE, jobId, { error });
}
