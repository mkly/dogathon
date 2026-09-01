-- CreateEnum
CREATE TYPE "RosterSyncJobTrigger" AS ENUM ('admin', 'scheduled');

-- AlterTable
ALTER TABLE "RosterSyncJob"
ADD COLUMN "trigger" "RosterSyncJobTrigger" NOT NULL DEFAULT 'admin',
ADD COLUMN "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ReplaceIndex
DROP INDEX "RosterSyncJob_orgId_status_requestedAt_idx";
CREATE INDEX "RosterSyncJob_orgId_status_availableAt_requestedAt_idx"
ON "RosterSyncJob"("orgId", "status", "availableAt", "requestedAt");
