/*
  Warnings:

  - The primary key for the `EmailConnector` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Pupdate` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `RescueSettings` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Resident` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `RosterSyncJob` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `requestedByUserId` column on the `RosterSyncJob` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Sponsor` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `userId` column on the `Sponsor` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `Sponsorship` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `VolunteerNote` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `account` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `invitation` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `member` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `organization` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `session` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `activeOrganizationId` column on the `session` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `user` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `verification` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - Changed the type of `orgId` on the `EmailConnector` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Pupdate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orgId` on the `Pupdate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `residentId` on the `Pupdate` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orgId` on the `RescueSettings` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Resident` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orgId` on the `Resident` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `RosterSyncJob` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orgId` on the `RosterSyncJob` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Sponsor` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `Sponsorship` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orgId` on the `Sponsorship` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `residentId` on the `Sponsorship` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `sponsorId` on the `Sponsorship` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `VolunteerNote` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `orgId` on the `VolunteerNote` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `residentId` on the `VolunteerNote` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `account` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `account` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `invitation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `organizationId` on the `invitation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `inviterId` on the `invitation` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `member` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `organizationId` on the `member` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `member` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `organization` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `session` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `userId` on the `session` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `user` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `id` on the `verification` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "EmailConnector" DROP CONSTRAINT "EmailConnector_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Pupdate" DROP CONSTRAINT "Pupdate_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Pupdate" DROP CONSTRAINT "Pupdate_residentId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "RescueSettings" DROP CONSTRAINT "RescueSettings_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_orgId_fkey";

-- DropForeignKey
ALTER TABLE "RosterSyncJob" DROP CONSTRAINT "RosterSyncJob_orgId_fkey";

-- DropForeignKey
ALTER TABLE "RosterSyncJob" DROP CONSTRAINT "RosterSyncJob_requestedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsor" DROP CONSTRAINT "Sponsor_userId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_residentId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_sponsorId_fkey";

-- DropForeignKey
ALTER TABLE "VolunteerNote" DROP CONSTRAINT "VolunteerNote_orgId_fkey";

-- DropForeignKey
ALTER TABLE "VolunteerNote" DROP CONSTRAINT "VolunteerNote_residentId_orgId_fkey";

-- DropForeignKey
ALTER TABLE "account" DROP CONSTRAINT "account_userId_fkey";

-- DropForeignKey
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_inviterId_fkey";

-- DropForeignKey
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "member" DROP CONSTRAINT "member_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "member" DROP CONSTRAINT "member_userId_fkey";

-- DropForeignKey
ALTER TABLE "session" DROP CONSTRAINT "session_userId_fkey";

-- AlterTable
ALTER TABLE "EmailConnector" DROP CONSTRAINT "EmailConnector_pkey",
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
ADD CONSTRAINT "EmailConnector_pkey" PRIMARY KEY ("orgId");

-- AlterTable
ALTER TABLE "Pupdate" DROP CONSTRAINT "Pupdate_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
DROP COLUMN "residentId",
ADD COLUMN     "residentId" UUID NOT NULL,
ADD CONSTRAINT "Pupdate_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "RescueSettings" DROP CONSTRAINT "RescueSettings_pkey",
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
ADD CONSTRAINT "RescueSettings_pkey" PRIMARY KEY ("orgId");

-- AlterTable
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
ADD CONSTRAINT "Resident_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "RosterSyncJob" DROP CONSTRAINT "RosterSyncJob_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
DROP COLUMN "requestedByUserId",
ADD COLUMN     "requestedByUserId" UUID,
ADD CONSTRAINT "RosterSyncJob_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Sponsor" DROP CONSTRAINT "Sponsor_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID,
ADD CONSTRAINT "Sponsor_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Sponsorship" DROP CONSTRAINT "Sponsorship_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
DROP COLUMN "residentId",
ADD COLUMN     "residentId" UUID NOT NULL,
DROP COLUMN "sponsorId",
ADD COLUMN     "sponsorId" UUID NOT NULL,
ADD CONSTRAINT "Sponsorship_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "VolunteerNote" DROP CONSTRAINT "VolunteerNote_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "orgId",
ADD COLUMN     "orgId" UUID NOT NULL,
DROP COLUMN "residentId",
ADD COLUMN     "residentId" UUID NOT NULL,
ADD CONSTRAINT "VolunteerNote_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "account" DROP CONSTRAINT "account_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "account_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "invitation" DROP CONSTRAINT "invitation_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "organizationId",
ADD COLUMN     "organizationId" UUID NOT NULL,
DROP COLUMN "inviterId",
ADD COLUMN     "inviterId" UUID NOT NULL,
ADD CONSTRAINT "invitation_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "member" DROP CONSTRAINT "member_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "organizationId",
ADD COLUMN     "organizationId" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "member_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "organization" DROP CONSTRAINT "organization_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "organization_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "session" DROP CONSTRAINT "session_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
DROP COLUMN "activeOrganizationId",
ADD COLUMN     "activeOrganizationId" UUID,
ADD CONSTRAINT "session_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "user" DROP CONSTRAINT "user_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "verification" DROP CONSTRAINT "verification_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "verification_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE INDEX "Pupdate_orgId_status_idx" ON "Pupdate"("orgId", "status");

-- CreateIndex
CREATE INDEX "Pupdate_residentId_orgId_status_idx" ON "Pupdate"("residentId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Pupdate_id_orgId_key" ON "Pupdate"("id", "orgId");

-- CreateIndex
CREATE INDEX "Resident_orgId_status_idx" ON "Resident"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_orgId_name_key" ON "Resident"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_id_orgId_key" ON "Resident"("id", "orgId");

-- CreateIndex
CREATE INDEX "RosterSyncJob_orgId_status_availableAt_requestedAt_idx" ON "RosterSyncJob"("orgId", "status", "availableAt", "requestedAt");

-- CreateIndex
CREATE INDEX "RosterSyncJob_orgId_status_leaseExpiresAt_idx" ON "RosterSyncJob"("orgId", "status", "leaseExpiresAt");

-- CreateIndex
CREATE INDEX "RosterSyncJob_requestedByUserId_idx" ON "RosterSyncJob"("requestedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterSyncJob_id_orgId_key" ON "RosterSyncJob"("id", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsor_userId_key" ON "Sponsor"("userId");

-- CreateIndex
CREATE INDEX "Sponsorship_orgId_status_idx" ON "Sponsorship"("orgId", "status");

-- CreateIndex
CREATE INDEX "Sponsorship_residentId_orgId_status_idx" ON "Sponsorship"("residentId", "orgId", "status");

-- CreateIndex
CREATE INDEX "Sponsorship_sponsorId_idx" ON "Sponsorship"("sponsorId");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsorship_id_orgId_key" ON "Sponsorship"("id", "orgId");

-- CreateIndex
CREATE INDEX "VolunteerNote_orgId_createdAt_idx" ON "VolunteerNote"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "VolunteerNote_residentId_orgId_createdAt_idx" ON "VolunteerNote"("residentId", "orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerNote_id_orgId_key" ON "VolunteerNote"("id", "orgId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailConnector" ADD CONSTRAINT "EmailConnector_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsor" ADD CONSTRAINT "Sponsor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSyncJob" ADD CONSTRAINT "RosterSyncJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterSyncJob" ADD CONSTRAINT "RosterSyncJob_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_residentId_orgId_fkey" FOREIGN KEY ("residentId", "orgId") REFERENCES "Resident"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_sponsorId_fkey" FOREIGN KEY ("sponsorId") REFERENCES "Sponsor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerNote" ADD CONSTRAINT "VolunteerNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerNote" ADD CONSTRAINT "VolunteerNote_residentId_orgId_fkey" FOREIGN KEY ("residentId", "orgId") REFERENCES "Resident"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pupdate" ADD CONSTRAINT "Pupdate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pupdate" ADD CONSTRAINT "Pupdate_residentId_orgId_fkey" FOREIGN KEY ("residentId", "orgId") REFERENCES "Resident"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RescueSettings" ADD CONSTRAINT "RescueSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
