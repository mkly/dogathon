import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient, type RosterSyncJob } from "@/generated/prisma/client";

import type { SyncSummary } from "./roster-sync.ts";
import { prisma } from "./prisma.ts";

export const DEFAULT_ROSTER_SYNC_MAX_ATTEMPTS = 3;
export const DEFAULT_ROSTER_SYNC_LEASE_MS = 5 * 60 * 1000;

type RosterSyncJobDb = Pick<PrismaClient, "$executeRaw" | "$queryRaw" | "$transaction"> & {
  rosterSyncJob: PrismaClient["rosterSyncJob"];
};

type EnqueueRosterSyncJobInput = {
  orgId: string;
  requestedByUserId?: string;
  trigger?: "admin" | "scheduled";
  availableAt?: Date;
  maxAttempts?: number;
};

export type EnqueueRosterSyncJobResult = {
  job: RosterSyncJob;
  enqueued: boolean;
};

type LeaseInput = {
  orgId: string;
  jobId: string;
  claimToken: string;
  now?: Date;
};

type ClaimRosterSyncJobInput = {
  orgId?: string;
  leaseMs?: number;
  now?: Date;
};

export class RosterSyncLeaseLostError extends Error {
  constructor(jobId: string) {
    super(`Roster sync job ${jobId} is no longer owned by this runner`);
    this.name = "RosterSyncLeaseLostError";
  }
}

export class RosterSyncJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Roster sync job ${jobId} was not found`);
    this.name = "RosterSyncJobNotFoundError";
  }
}

export function createRosterSyncJobQueue(db: RosterSyncJobDb) {
  async function enqueueWithResult(
    input: EnqueueRosterSyncJobInput,
  ): Promise<EnqueueRosterSyncJobResult> {
    const maxAttempts = input.maxAttempts ?? DEFAULT_ROSTER_SYNC_MAX_ATTEMPTS;
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new RangeError("maxAttempts must be a positive integer");
    }

    return db.$transaction(async (tx) => {
      // Serialize enqueues for one tenant. The partial unique index is a second
      // line of defence, but the lock lets us return the existing row cleanly.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.orgId}, 0))`;
      const existing = await tx.rosterSyncJob.findFirst({
        where: { orgId: input.orgId, status: { in: ["queued", "running"] } },
        orderBy: { requestedAt: "asc" },
      });
      if (existing) return { job: existing, enqueued: false };

      const job = await tx.rosterSyncJob.create({
        data: {
          orgId: input.orgId,
          requestedByUserId: input.requestedByUserId,
          trigger: input.trigger ?? "admin",
          availableAt: input.availableAt,
          maxAttempts,
        },
      });
      return { job, enqueued: true };
    });
  }

  async function enqueue(input: EnqueueRosterSyncJobInput): Promise<RosterSyncJob> {
    return (await enqueueWithResult(input)).job;
  }

  async function claim(input: ClaimRosterSyncJobInput): Promise<RosterSyncJob | null> {
    const now = input.now ?? new Date();
    const leaseExpiresAt = leaseEnd(now, input.leaseMs);
    const claimToken = randomUUID();
    const organizationFilter = input.orgId
      ? Prisma.sql`AND "orgId" = ${input.orgId}`
      : Prisma.empty;

    await db.$executeRaw`
      UPDATE "RosterSyncJob"
      SET "status" = 'failed',
          "finishedAt" = ${now},
          "heartbeatAt" = NULL,
          "leaseExpiresAt" = NULL,
          "claimToken" = NULL,
          "errorMessage" = COALESCE("errorMessage", 'Roster sync lease expired after the maximum number of attempts')
      WHERE "status" = 'running'
        ${organizationFilter}
        AND "leaseExpiresAt" <= ${now}
        AND "attempts" >= "maxAttempts"
    `;

    const jobs = await db.$queryRaw<RosterSyncJob[]>`
      WITH candidate AS (
        SELECT "id"
        FROM "RosterSyncJob"
        WHERE "attempts" < "maxAttempts"
          ${organizationFilter}
          AND "availableAt" <= ${now}
          AND (
            "status" = 'queued'
            OR ("status" = 'running' AND "leaseExpiresAt" <= ${now})
          )
        ORDER BY "availableAt" ASC, "requestedAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "RosterSyncJob" AS job
      SET "status" = 'running',
          "attempts" = job."attempts" + 1,
          "startedAt" = ${now},
          "finishedAt" = NULL,
          "heartbeatAt" = ${now},
          "leaseExpiresAt" = ${leaseExpiresAt},
          "claimToken" = ${claimToken},
          "refusalReason" = NULL
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    `;
    return jobs[0] ?? null;
  }

  async function heartbeat(
    input: LeaseInput & { leaseMs?: number },
  ): Promise<RosterSyncJob> {
    const now = input.now ?? new Date();
    const result = await db.rosterSyncJob.updateMany({
      where: {
        id: input.jobId,
        orgId: input.orgId,
        status: "running",
        claimToken: input.claimToken,
        leaseExpiresAt: { gt: now },
      },
      data: { heartbeatAt: now, leaseExpiresAt: leaseEnd(now, input.leaseMs) },
    });
    if (result.count !== 1) throw new RosterSyncLeaseLostError(input.jobId);
    return requireJob(input.orgId, input.jobId);
  }

  async function succeed(
    input: LeaseInput & { summary: SyncSummary },
  ): Promise<RosterSyncJob> {
    return finish(input, {
      status: "succeeded",
      summary: input.summary,
      refusalReason: null,
      errorMessage: null,
    });
  }

  async function refuse(
    input: LeaseInput & { reason: string },
  ): Promise<RosterSyncJob> {
    return finish(input, {
      status: "refused",
      summary: Prisma.DbNull,
      refusalReason: input.reason,
      errorMessage: null,
    });
  }

  async function fail(
    input: LeaseInput & { error: string },
  ): Promise<RosterSyncJob> {
    const now = input.now ?? new Date();
    return db.$transaction(async (tx) => {
      const current = await tx.rosterSyncJob.findFirst({
        where: {
          id: input.jobId,
          orgId: input.orgId,
          status: "running",
          claimToken: input.claimToken,
        },
      });
      if (!current) throw new RosterSyncLeaseLostError(input.jobId);

      const terminal = current.attempts >= current.maxAttempts;
      const result = await tx.rosterSyncJob.updateMany({
        where: {
          id: input.jobId,
          orgId: input.orgId,
          status: "running",
          claimToken: input.claimToken,
          attempts: current.attempts,
        },
        data: {
          status: terminal ? "failed" : "queued",
          finishedAt: terminal ? now : null,
          heartbeatAt: null,
          leaseExpiresAt: null,
          claimToken: null,
          errorMessage: input.error,
        },
      });
      if (result.count !== 1) throw new RosterSyncLeaseLostError(input.jobId);

      const job = await tx.rosterSyncJob.findFirst({
        where: { id: input.jobId, orgId: input.orgId },
      });
      if (!job) throw new Error(`Roster sync job ${input.jobId} disappeared`);
      return job;
    });
  }

  async function finish(
    input: LeaseInput,
    data: Prisma.RosterSyncJobUpdateManyMutationInput,
  ): Promise<RosterSyncJob> {
    const now = input.now ?? new Date();
    const result = await db.rosterSyncJob.updateMany({
      where: {
        id: input.jobId,
        orgId: input.orgId,
        status: "running",
        claimToken: input.claimToken,
      },
      data: {
        ...data,
        finishedAt: now,
        heartbeatAt: null,
        leaseExpiresAt: null,
        claimToken: null,
      },
    });
    if (result.count !== 1) throw new RosterSyncLeaseLostError(input.jobId);
    return requireJob(input.orgId, input.jobId);
  }

  async function requireJob(orgId: string, jobId: string): Promise<RosterSyncJob> {
    const job = await db.rosterSyncJob.findFirst({ where: { id: jobId, orgId } });
    if (!job) throw new RosterSyncJobNotFoundError(jobId);
    return job;
  }

  return { enqueue, enqueueWithResult, claim, heartbeat, succeed, refuse, fail, get: requireJob };
}

function leaseEnd(now: Date, leaseMs = DEFAULT_ROSTER_SYNC_LEASE_MS) {
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new RangeError("leaseMs must be positive");
  }
  return new Date(now.getTime() + leaseMs);
}

const defaultQueue = createRosterSyncJobQueue(prisma);

export const enqueueRosterSyncJob = defaultQueue.enqueue;
export const enqueueRosterSyncJobWithResult = defaultQueue.enqueueWithResult;
export const claimRosterSyncJob = defaultQueue.claim;
export const heartbeatRosterSyncJob = defaultQueue.heartbeat;
export const succeedRosterSyncJob = defaultQueue.succeed;
export const refuseRosterSyncJob = defaultQueue.refuse;
export const failRosterSyncJob = defaultQueue.fail;
export const getRosterSyncJob = defaultQueue.get;
