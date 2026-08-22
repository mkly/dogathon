-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ResidentStatus" AS ENUM ('available', 'adopted');
CREATE TYPE "SponsorshipChannel" AS ENUM ('email', 'sms', 'both');
CREATE TYPE "SponsorshipStatus" AS ENUM ('active', 'ended');
CREATE TYPE "PupdateType" AS ENUM ('regular', 'graduation');
CREATE TYPE "PupdateStatus" AS ENUM ('draft', 'approved', 'sent');

-- Better Auth tables
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

CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

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

CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- Sirius domain tables
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
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

CREATE TABLE "Sponsorship" (
    "id" TEXT NOT NULL,
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

CREATE TABLE "VolunteerNote" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VolunteerNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pupdate" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "type" "PupdateType" NOT NULL DEFAULT 'regular',
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "smsText" TEXT NOT NULL,
    "status" "PupdateStatus" NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Pupdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RescueSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "sourceUrl" TEXT NOT NULL DEFAULT 'https://www.coppersdream.org/dogs-and-more-back-up',
    "pinnedPostscript" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "RescueSettings_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");
CREATE INDEX "session_userId_idx" ON "session"("userId");
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");
CREATE INDEX "account_userId_idx" ON "account"("userId");
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account"("issuer", "accountId");
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
CREATE UNIQUE INDEX "Resident_name_key" ON "Resident"("name");
CREATE INDEX "Resident_status_idx" ON "Resident"("status");
CREATE INDEX "Sponsorship_residentId_status_idx" ON "Sponsorship"("residentId", "status");
CREATE INDEX "VolunteerNote_residentId_createdAt_idx" ON "VolunteerNote"("residentId", "createdAt");
CREATE INDEX "Pupdate_residentId_status_idx" ON "Pupdate"("residentId", "status");

-- Foreign keys
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sponsorship" ADD CONSTRAINT "Sponsorship_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VolunteerNote" ADD CONSTRAINT "VolunteerNote_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Pupdate" ADD CONSTRAINT "Pupdate_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
