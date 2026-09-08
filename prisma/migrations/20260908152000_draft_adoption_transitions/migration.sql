CREATE TYPE "ResidentUnavailabilityReason" AS ENUM ('adopted', 'unavailable');

ALTER TYPE "SponsorshipStatus" ADD VALUE 'awaiting';
ALTER TYPE "SponsorUpdateStatus" ADD VALUE 'dismissed';

ALTER TABLE "Resident"
ADD COLUMN "unavailabilityReason" "ResidentUnavailabilityReason";

UPDATE "Resident"
SET "unavailabilityReason" = 'unavailable'
WHERE "available" = false;

ALTER TABLE "Sponsorship"
DROP COLUMN "stripeCancellationPendingAt",
ADD COLUMN "awaitingSince" TIMESTAMP(3);

ALTER TABLE "SponsorUpdate"
ADD COLUMN "sponsorshipId" UUID;

CREATE INDEX "SponsorUpdate_sponsorshipId_idx" ON "SponsorUpdate"("sponsorshipId");

ALTER TABLE "SponsorUpdate"
ADD CONSTRAINT "SponsorUpdate_sponsorshipId_fkey"
FOREIGN KEY ("sponsorshipId") REFERENCES "Sponsorship"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
