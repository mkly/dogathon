-- Replace per-chat volunteer notes with accumulated sponsor updates.
ALTER TABLE "CheckIn" DROP CONSTRAINT "CheckIn_noteId_fkey";
ALTER TABLE "VolunteerPhoto" DROP CONSTRAINT "VolunteerPhoto_noteId_fkey";

DROP INDEX "CheckIn_noteId_key";
DROP INDEX "VolunteerPhoto_noteId_idx";

ALTER TABLE "CheckIn"
DROP COLUMN "noteId",
ADD COLUMN "sponsorUpdateId" UUID;

ALTER TABLE "VolunteerPhoto"
DROP COLUMN "noteId",
ADD COLUMN "caption" TEXT,
ADD COLUMN "webStorageKey" TEXT,
ADD COLUMN "webUrl" TEXT;

ALTER TABLE "SponsorUpdate"
DROP COLUMN "photoUrl",
ADD COLUMN "heroPhotoUrl" TEXT,
ADD COLUMN "teaser" TEXT NOT NULL DEFAULT '';

DROP TABLE "VolunteerNote";

CREATE UNIQUE INDEX "VolunteerPhoto_webStorageKey_key" ON "VolunteerPhoto"("webStorageKey");
CREATE INDEX "CheckIn_orgId_residentId_status_sponsorUpdateId_idx"
ON "CheckIn"("orgId", "residentId", "status", "sponsorUpdateId");

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_sponsorUpdateId_fkey"
FOREIGN KEY ("sponsorUpdateId") REFERENCES "SponsorUpdate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
