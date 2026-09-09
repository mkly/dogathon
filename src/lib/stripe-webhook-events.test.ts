import assert from "node:assert/strict";
import { test } from "node:test";

import { processStripeWebhookEvent } from "./stripe-webhook-events";

function memoryEventStore() {
  const savedEventIds = new Set<string>();
  return {
    savedEventIds,
    async create({ data }: { data: { id: string; type: string } }) {
      if (savedEventIds.has(data.id)) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      savedEventIds.add(data.id);
    },
    async delete({ where }: { where: { id: string } }) {
      savedEventIds.delete(where.id);
    },
  };
}

test("Stripe webhook events are processed once when Stripe retries the same event", async () => {
  let processCount = 0;
  const event = {
    id: "evt_checkout_complete",
    type: "checkout.session.completed",
  };
  const store = memoryEventStore();

  const processEvent = async () => {
    processCount += 1;
  };

  assert.equal(
    await processStripeWebhookEvent(event as never, store, processEvent),
    true,
  );
  assert.equal(
    await processStripeWebhookEvent(event as never, store, processEvent),
    false,
  );
  assert.equal(processCount, 1);
});

test("a Stripe event whose processing fails is retried on the next delivery", async () => {
  const event = {
    id: "evt_checkout_failed",
    type: "checkout.session.completed",
  };
  const store = memoryEventStore();
  let attempts = 0;
  const processEvent = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("processing failed");
  };

  await assert.rejects(
    processStripeWebhookEvent(event as never, store, processEvent),
    /processing failed/,
  );
  assert.equal(store.savedEventIds.has(event.id), false);

  assert.equal(
    await processStripeWebhookEvent(event as never, store, processEvent),
    true,
  );
  assert.equal(attempts, 2);
});
