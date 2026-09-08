ALTER TABLE "SponsorshipTier"
ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "SponsorshipTier" AS tier
SET "isDefault" = true
WHERE tier."id" IN (
  SELECT DISTINCT ON ("orgId") "id"
  FROM "SponsorshipTier"
  ORDER BY "orgId", "position" ASC
);
