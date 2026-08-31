-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('available', 'adopted');

-- CreateEnum
CREATE TYPE "SponsorshipChannel" AS ENUM ('email', 'sms', 'both');

-- CreateEnum
CREATE TYPE "SponsorshipStatus" AS ENUM ('active', 'ended');

-- CreateEnum
CREATE TYPE "PupdateType" AS ENUM ('regular', 'graduation');

-- CreateEnum
CREATE TYPE "PupdateStatus" AS ENUM ('draft', 'approved', 'sent');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "username" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "dobText" TEXT NOT NULL,
    "ageText" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "weightText" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "careNotes" TEXT[],
    "photoUrls" TEXT[],
    "status" "ResidentStatus" NOT NULL DEFAULT 'available',
    "adoptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sponsorship" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "sponsorName" TEXT NOT NULL,
    "sponsorEmail" TEXT NOT NULL,
    "sponsorPhone" TEXT,
    "channel" "SponsorshipChannel" NOT NULL,
    "monthlyUsd" INTEGER NOT NULL DEFAULT 25,
    "status" "SponsorshipStatus" NOT NULL DEFAULT 'active',
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sponsorship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "photoUrl" TEXT,
    "photoData" BYTEA,
    "photoMime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pupdate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "type" "PupdateType" NOT NULL DEFAULT 'regular',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "smsText" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "PupdateStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pupdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RescueSettings" (
    "orgId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL DEFAULT 'https://www.coppersdream.org/dogs-and-more-back-up',
    "pinnedPostscript" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "RescueSettings_pkey" PRIMARY KEY ("orgId")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account"("issuer", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "Resident_orgId_status_idx" ON "Resident"("orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_orgId_name_key" ON "Resident"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_id_orgId_key" ON "Resident"("id", "orgId");

-- CreateIndex
CREATE INDEX "Sponsorship_orgId_status_idx" ON "Sponsorship"("orgId", "status");

-- CreateIndex
CREATE INDEX "Sponsorship_residentId_orgId_status_idx" ON "Sponsorship"("residentId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsorship_id_orgId_key" ON "Sponsorship"("id", "orgId");

-- CreateIndex
CREATE INDEX "VolunteerNote_orgId_createdAt_idx" ON "VolunteerNote"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "VolunteerNote_residentId_orgId_createdAt_idx" ON "VolunteerNote"("residentId", "orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerNote_id_orgId_key" ON "VolunteerNote"("id", "orgId");

-- CreateIndex
CREATE INDEX "Pupdate_orgId_status_idx" ON "Pupdate"("orgId", "status");

-- CreateIndex
CREATE INDEX "Pupdate_residentId_orgId_status_idx" ON "Pupdate"("residentId", "orgId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Pupdate_id_orgId_key" ON "Pupdate"("id", "orgId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_residentId_orgId_fkey" FOREIGN KEY ("residentId", "orgId") REFERENCES "Resident"("id", "orgId") ON DELETE CASCADE ON UPDATE CASCADE;

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
