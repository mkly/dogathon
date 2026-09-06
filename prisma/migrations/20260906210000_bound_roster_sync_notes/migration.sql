-- Every sync used to insert a fresh note, so collapse each (orgId, sourceUrl)
-- down to its newest row before the unique index can be built.
DELETE FROM "RosterSyncNote" older
USING "RosterSyncNote" newer
WHERE older."orgId" = newer."orgId"
  AND older."sourceUrl" = newer."sourceUrl"
  AND (older."createdAt", older."id") < (newer."createdAt", newer."id");

DROP INDEX "RosterSyncNote_orgId_sourceUrl_createdAt_idx";

CREATE UNIQUE INDEX "RosterSyncNote_orgId_sourceUrl_key" ON "RosterSyncNote"("orgId", "sourceUrl");
