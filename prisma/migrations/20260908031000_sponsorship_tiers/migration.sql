CREATE TABLE "SponsorshipTier" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "SponsorshipTier_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SponsorshipTier" ("id", "orgId", "monthlyCents", "description", "position")
SELECT gen_random_uuid(), organization."id", COALESCE(settings."sponsorshipMonthlyCents", 2500), '', 0
FROM "organization" AS organization
LEFT JOIN "RescueSettings" AS settings ON settings."orgId" = organization."id";

ALTER TABLE "RescueSettings" DROP COLUMN "sponsorshipMonthlyCents";

CREATE UNIQUE INDEX "SponsorshipTier_orgId_position_key"
ON "SponsorshipTier"("orgId", "position");

CREATE INDEX "SponsorshipTier_orgId_idx" ON "SponsorshipTier"("orgId");

ALTER TABLE "SponsorshipTier"
ADD CONSTRAINT "SponsorshipTier_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
