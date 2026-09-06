DROP INDEX "RosterSyncNote_orgId_sourceUrl_createdAt_idx";

CREATE UNIQUE INDEX "RosterSyncNote_orgId_sourceUrl_key" ON "RosterSyncNote"("orgId", "sourceUrl");
