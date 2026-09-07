import assert from "node:assert/strict";
import test from "node:test";

import {
  startSponsorshipCheckout,
  type SponsorshipCheckoutDependencies,
} from "./sponsorship-checkout.ts";

const residentId = "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8";
const organization = { id: "org_rescue", settings: { allowedOrigins: [] } };

function dependencies() {
  let checkoutCalled = false;
  const value: SponsorshipCheckoutDependencies = {
    async createCheckout(input) {
      checkoutCalled = true;
      assert.equal(input.orgId, organization.id);
      assert.equal(input.residentId, residentId);
      assert.equal(input.sponsorName, "Avery Sponsor");
      assert.equal(input.sponsorEmail, "avery@example.com");
      return { url: "https://checkout.stripe.test/session" };
    },
    async findOrganization(slug) {
      return slug === "fixture-rescue" ? organization : null;
    },
    async findResidentBySource() {
      throw new Error("The companion-page action must not resolve by source URL");
    },
    async rateLimit() {
      return { allowed: true, retryAfterSeconds: 60 };
    },
  };
  return { value, get checkoutCalled() { return checkoutCalled; } };
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    headers: new Headers(),
    orgSlug: "fixture-rescue",
    sponsorEmail: "avery@example.com",
    sponsorName: "Avery Sponsor",
    target: { kind: "resident-id", value: residentId },
    ...overrides,
  };
}

function destination() {
  return {
    cancelUrl: "https://app.test/companion?checkout=canceled",
    errorUrl: (code: string) => `https://app.test/companion?error=${code}`,
    successUrl: "https://app.test/companion?sponsored=1&session_id={CHECKOUT_SESSION_ID}",
  };
}

test("the existing resident-id checkout path creates a Stripe session", async () => {
  const deps = dependencies();
  const result = await startSponsorshipCheckout(input(), destination, {
    dependencies: deps.value,
  });

  assert.deepEqual(result, { ok: true, url: "https://checkout.stripe.test/session" });
  assert.equal(deps.checkoutCalled, true);
});

test("invalid sponsor details retain the companion context for the server action", async () => {
  const deps = dependencies();
  const result = await startSponsorshipCheckout(input({ sponsorEmail: "invalid" }), destination, {
    dependencies: deps.value,
  });

  assert.equal(result.ok, false);
  if (result.ok || result.reason !== "checkout-error") assert.fail("expected checkout error");
  assert.equal(result.code, "invalid");
  assert.equal(result.orgSlug, "fixture-rescue");
  assert.equal(result.residentId, residentId);
  assert.equal(deps.checkoutCalled, false);
});

test("an invalid resident id keeps the server action's not-found behavior", async () => {
  const deps = dependencies();
  const result = await startSponsorshipCheckout(
    input({ target: { kind: "resident-id", value: "not-a-uuid" } }),
    destination,
    { dependencies: deps.value },
  );

  assert.deepEqual(result, { ok: false, reason: "not-found" });
  assert.equal(deps.checkoutCalled, false);
});
