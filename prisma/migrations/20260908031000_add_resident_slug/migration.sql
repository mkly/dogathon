ALTER TABLE "Resident" ADD COLUMN "slug" TEXT;

DO $$
DECLARE
  resident_record RECORD;
  base_slug TEXT;
  candidate_slug TEXT;
  suffix INTEGER;
BEGIN
  FOR resident_record IN
    SELECT "id", "orgId", "name"
    FROM "Resident"
    ORDER BY "orgId", "createdAt", "id"
  LOOP
    base_slug := TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(resident_record."name"), '[^a-z0-9]+', '-', 'g'));
    IF base_slug = '' THEN
      base_slug := 'resident';
    END IF;

    candidate_slug := base_slug;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1
      FROM "Resident"
      WHERE "orgId" = resident_record."orgId"
        AND "slug" = candidate_slug
    ) LOOP
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE "Resident"
    SET "slug" = candidate_slug
    WHERE "id" = resident_record."id";
  END LOOP;
END $$;

ALTER TABLE "Resident" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Resident_orgId_slug_key" ON "Resident"("orgId", "slug");
