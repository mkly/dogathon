-- Pupdates written before the photoUrl column have to recover the picture the
-- same way the email used to infer it: the newest volunteer-note photo that
-- already existed when the draft was composed.
UPDATE "Pupdate" p
SET "photoUrl" = (
  SELECT n."photoUrl"
  FROM "VolunteerNote" n
  WHERE n."residentId" = p."residentId"
    AND n."photoUrl" IS NOT NULL
    AND n."createdAt" <= p."createdAt"
  ORDER BY n."createdAt" DESC
  LIMIT 1
)
WHERE p."photoUrl" IS NULL;
