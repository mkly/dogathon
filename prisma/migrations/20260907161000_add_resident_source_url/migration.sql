ALTER TABLE "Resident" ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "Resident_orgId_sourceUrl_key"
  ON "Resident"("orgId", "sourceUrl")
  WHERE "sourceUrl" <> '';
