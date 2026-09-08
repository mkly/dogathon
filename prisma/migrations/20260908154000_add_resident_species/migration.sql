DROP INDEX "Resident_orgId_available_idx";

ALTER TABLE "Resident" ADD COLUMN "species" TEXT NOT NULL DEFAULT '';

CREATE INDEX "Resident_orgId_available_species_idx" ON "Resident"("orgId", "available", "species");
