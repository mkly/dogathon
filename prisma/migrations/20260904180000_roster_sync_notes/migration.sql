-- Notes the roster discovery agent leaves for its next crawl of a source.
CREATE TABLE "RosterSyncNote" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RosterSyncNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RosterSyncNote_orgId_sourceUrl_createdAt_idx" ON "RosterSyncNote"("orgId", "sourceUrl", "createdAt");

ALTER TABLE "RosterSyncNote" ADD CONSTRAINT "RosterSyncNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
