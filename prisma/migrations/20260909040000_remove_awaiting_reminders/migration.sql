ALTER TABLE "Sponsorship"
DROP COLUMN "awaitingSince",
DROP COLUMN "awaitingReminderDraftedAt";

ALTER TABLE "SponsorUpdate"
DROP COLUMN "isAwaitingReminder";
