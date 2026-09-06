-- The preceding migration's README documents the required data-migration step.
ALTER TABLE "VolunteerNote"
DROP COLUMN "photoData",
DROP COLUMN "photoMime";
