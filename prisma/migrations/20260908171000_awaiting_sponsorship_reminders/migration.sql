ALTER TABLE "Sponsorship"
ADD COLUMN "awaitingReminderDraftedAt" TIMESTAMP(3);

ALTER TABLE "SponsorUpdate"
ADD COLUMN "isAwaitingReminder" BOOLEAN NOT NULL DEFAULT false;
