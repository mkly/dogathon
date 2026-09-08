CREATE TYPE "CheckInStatus" AS ENUM ('in_progress', 'completed');

CREATE TABLE "CheckIn" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "residentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "CheckInStatus" NOT NULL DEFAULT 'in_progress',
    "transcript" JSONB NOT NULL,
    "noteId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VolunteerPhoto" ADD COLUMN "checkInId" UUID;

CREATE UNIQUE INDEX "CheckIn_id_orgId_key" ON "CheckIn"("id", "orgId");
CREATE UNIQUE INDEX "CheckIn_noteId_key" ON "CheckIn"("noteId");
CREATE INDEX "CheckIn_orgId_residentId_createdAt_idx" ON "CheckIn"("orgId", "residentId", "createdAt");
CREATE INDEX "CheckIn_userId_status_idx" ON "CheckIn"("userId", "status");
CREATE INDEX "VolunteerPhoto_checkInId_idx" ON "VolunteerPhoto"("checkInId");

ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_residentId_orgId_fkey" FOREIGN KEY ("residentId", "orgId") REFERENCES "Resident"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "VolunteerNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VolunteerPhoto" ADD CONSTRAINT "VolunteerPhoto_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "CheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;
