/** Shared by the staff-room warning and the settings card it links to. */
export const STRIPE_CONNECT_NOTICE_ID = "stripe-connect-notice";

export type StripeConnection = {
  stripeAccountId: string | null;
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
};

/** Why sponsors cannot check out yet, or null once Stripe can take card payments. */
export function stripeNotReadyReason(connection: StripeConnection | null) {
  if (connection?.stripeChargesEnabled) return null;
  if (connection?.stripeDetailsSubmitted) {
    return "Stripe has this rescue's details but still needs more before it can enable card payments.";
  }
  if (connection?.stripeAccountId) {
    return "Stripe onboarding was started but never finished.";
  }
  return "This rescue is not connected to Stripe.";
}
