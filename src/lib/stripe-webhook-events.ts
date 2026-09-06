import type Stripe from "stripe";

export type StripeWebhookEventStore = {
  create(input: { data: { id: string; type: string } }): Promise<unknown>;
};

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && error.code === "P2002";
}

/**
 * Records an event before processing it so Stripe retries are harmless. A
 * duplicate event ID has already been processed (or is being processed), so
 * callers can acknowledge it without running the handler again.
 */
export async function processStripeWebhookEvent(
  event: Stripe.Event,
  store: StripeWebhookEventStore,
  processEvent: (event: Stripe.Event) => Promise<void>,
) {
  try {
    await store.create({ data: { id: event.id, type: event.type } });
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }

  await processEvent(event);
  return true;
}
