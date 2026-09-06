ALTER TYPE "PupdateType" RENAME TO "SponsorUpdateType";

ALTER TYPE "PupdateStatus" RENAME TO "SponsorUpdateStatus";

ALTER TABLE "Pupdate" RENAME TO "SponsorUpdate";

ALTER TABLE "SponsorUpdate" RENAME CONSTRAINT "Pupdate_pkey" TO "SponsorUpdate_pkey";
ALTER TABLE "SponsorUpdate" RENAME CONSTRAINT "Pupdate_orgId_fkey" TO "SponsorUpdate_orgId_fkey";
ALTER TABLE "SponsorUpdate" RENAME CONSTRAINT "Pupdate_residentId_orgId_fkey" TO "SponsorUpdate_residentId_orgId_fkey";

ALTER INDEX "Pupdate_orgId_status_idx" RENAME TO "SponsorUpdate_orgId_status_idx";
ALTER INDEX "Pupdate_residentId_orgId_status_idx" RENAME TO "SponsorUpdate_residentId_orgId_status_idx";
ALTER INDEX "Pupdate_id_orgId_key" RENAME TO "SponsorUpdate_id_orgId_key";
