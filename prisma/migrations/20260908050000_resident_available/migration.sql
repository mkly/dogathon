-- Replace the adoption-flavored resident status with a plain availability flag
-- and constrain the sponsorship end reason to the two ways a sponsorship ends.
CREATE TYPE "SponsorshipEndedReason" AS ENUM ('unavailable', 'canceled');

ALTER TABLE "Sponsorship"
  ALTER COLUMN "endedReason" TYPE "SponsorshipEndedReason"
  USING (
    CASE "endedReason"
      WHEN 'adopted' THEN 'unavailable'::"SponsorshipEndedReason"
      WHEN 'stripe_subscription_canceled' THEN 'canceled'::"SponsorshipEndedReason"
      ELSE NULL
    END
  );

DROP INDEX IF EXISTS "Resident_orgId_status_idx";

ALTER TABLE "Resident" ADD COLUMN "available" BOOLEAN NOT NULL DEFAULT true;
UPDATE "Resident" SET "available" = ("status" = 'available');
ALTER TABLE "Resident" DROP COLUMN "status";
ALTER TABLE "Resident" DROP COLUMN "adoptedAt";

DROP TYPE "ResidentStatus";

CREATE INDEX "Resident_orgId_available_idx" ON "Resident"("orgId", "available");
