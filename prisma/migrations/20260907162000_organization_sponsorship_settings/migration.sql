ALTER TABLE "RescueSettings"
ADD COLUMN "sponsorshipMonthlyCents" INTEGER NOT NULL DEFAULT 2500,
ADD COLUMN "allowedOrigins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "Sponsorship" RENAME COLUMN "monthlyUsd" TO "monthlyCents";
UPDATE "Sponsorship" SET "monthlyCents" = "monthlyCents" * 100;
ALTER TABLE "Sponsorship" ALTER COLUMN "monthlyCents" SET DEFAULT 2500;
