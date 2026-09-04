-- A rescue starts without an adoption-page source; the nightly scheduler already
-- skips organizations whose sourceUrl is empty.
ALTER TABLE "RescueSettings" ALTER COLUMN "sourceUrl" SET DEFAULT '';
