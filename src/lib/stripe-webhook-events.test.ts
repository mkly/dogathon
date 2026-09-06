import assert from "node:assert/strict";
import { test } from "node:test";

import { processStripeWebhookEvent } from "./stripe-webhook-events";

test("Stripe webhook events are processed once when Stripe retries the same event", async () => {
  const savedEventIds = new Set<string>();
  let processCount = 0;
  const event = { id: "evt_checkout_complete", type: "checkout.session.completed" };
  const store = {
    async create({ data }: { data: { id: string; type: string } }) {
      if (savedEventIds.has(data.id)) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      savedEventIds.add(data.id);
    },
  };

  const processEvent = async () => { processCount += 1; };

  assert.equal(await processStripeWebhookEvent(event as never, store, processEvent), true);
  assert.equal(await processStripeWebhookEvent(event as never, store, processEvent), false);
  assert.equal(processCount, 1);
});
