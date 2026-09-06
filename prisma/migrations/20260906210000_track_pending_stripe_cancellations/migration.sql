-- Sponsorships ended by roster adoption keep an explicit retry marker until
-- their connected-account Stripe subscription has been cancelled.
ALTER TABLE "Sponsorship"
ADD COLUMN "stripeCancellationPendingAt" TIMESTAMP(3);
