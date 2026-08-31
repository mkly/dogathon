-- AlterTable
ALTER TABLE "organization"
ADD COLUMN "stripeAccountId" TEXT,
ADD COLUMN "stripeDetailsSubmitted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Sponsorship"
ADD COLUMN "endedAt" TIMESTAMP(3),
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripeSubscriptionId" TEXT,
ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organization_stripeAccountId_key" ON "organization"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsorship_stripeCheckoutSessionId_key" ON "Sponsorship"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Sponsorship_stripeSubscriptionId_key" ON "Sponsorship"("stripeSubscriptionId");
