-- CreateEnum
CREATE TYPE "EmailConnectorType" AS ENUM ('gmail', 'microsoft', 'smtp');

-- CreateTable
CREATE TABLE "EmailConnector" (
    "orgId" TEXT NOT NULL,
    "type" "EmailConnectorType" NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "refreshTokenEncrypted" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpSecure" BOOLEAN,
    "smtpUser" TEXT,
    "smtpPasswordEncrypted" TEXT,
    "oauthProvider" "EmailConnectorType",
    "oauthStateHash" TEXT,
    "oauthStateExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConnector_pkey" PRIMARY KEY ("orgId")
);

-- AddForeignKey
ALTER TABLE "EmailConnector" ADD CONSTRAINT "EmailConnector_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
