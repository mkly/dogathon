-- CreateTable
CREATE TABLE "VolunteerPhoto" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "noteId" UUID,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerPhoto_storageKey_key" ON "VolunteerPhoto"("storageKey");
CREATE UNIQUE INDEX "VolunteerPhoto_id_orgId_key" ON "VolunteerPhoto"("id", "orgId");
CREATE INDEX "VolunteerPhoto_noteId_idx" ON "VolunteerPhoto"("noteId");
CREATE INDEX "VolunteerPhoto_orgId_createdAt_idx" ON "VolunteerPhoto"("orgId", "createdAt");

-- AddForeignKey
ALTER TABLE "VolunteerPhoto" ADD CONSTRAINT "VolunteerPhoto_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerPhoto" ADD CONSTRAINT "VolunteerPhoto_residentId_orgId_fkey"
FOREIGN KEY ("residentId", "orgId") REFERENCES "Resident"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerPhoto" ADD CONSTRAINT "VolunteerPhoto_noteId_fkey"
FOREIGN KEY ("noteId") REFERENCES "VolunteerNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
