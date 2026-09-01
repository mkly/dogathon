-- CreateEnum
CREATE TYPE "RosterSyncJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'refused');

-- CreateTable
CREATE TABLE "RosterSyncJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "RosterSyncJobStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "claimToken" TEXT,
    "summary" JSONB,
    "refusalReason" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "RosterSyncJob_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RosterSyncJob_attempts_check" CHECK ("attempts" >= 0),
    CONSTRAINT "RosterSyncJob_maxAttempts_check" CHECK ("maxAttempts" > 0)
);

-- A database-level backstop for enqueue callers outside the DAL. Prisma does
-- not currently express partial unique indexes in its schema language.
CREATE UNIQUE INDEX "RosterSyncJob_one_active_per_org"
ON "RosterSyncJob"("orgId")
WHERE "status" IN ('queued', 'running');

CREATE UNIQUE INDEX "RosterSyncJob_id_orgId_key" ON "RosterSyncJob"("id", "orgId");
CREATE INDEX "RosterSyncJob_orgId_status_requestedAt_idx" ON "RosterSyncJob"("orgId", "status", "requestedAt");
CREATE INDEX "RosterSyncJob_orgId_status_leaseExpiresAt_idx" ON "RosterSyncJob"("orgId", "status", "leaseExpiresAt");
CREATE INDEX "RosterSyncJob_requestedByUserId_idx" ON "RosterSyncJob"("requestedByUserId");

ALTER TABLE "RosterSyncJob" ADD CONSTRAINT "RosterSyncJob_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RosterSyncJob" ADD CONSTRAINT "RosterSyncJob_requestedByUserId_fkey"
FOREIGN KEY ("requestedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
