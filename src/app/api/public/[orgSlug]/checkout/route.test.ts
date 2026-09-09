import assert from "node:assert/strict";
import test from "node:test";

import type { SponsorshipCheckoutDependencies } from "@/lib/sponsorship-checkout";
import type { SponsorshipCheckout } from "@/lib/stripe-billing";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { createPublicCheckoutPostHandler } = await import("./route.ts");

const organization = {
  id: "org_rescue",
  settings: { allowedOrigins: ["https://rescue.example"] },
  sponsorshipTiers: [
    { id: "tier-supporter", monthlyCents: 2500, isDefault: false },
    { id: "tier-champion", monthlyCents: 5000, isDefault: true },
  ],
};
const source = "https://rescue.example/dogs/mabel?utm_source=mail";

type DependencyOptions = {
  rateLimited?: boolean;
  resident?: { id: string } | null;
};

function dependencies(options: DependencyOptions = {}) {
  let checkoutInput: SponsorshipCheckout | undefined;
  const findOrganization = async (slug: string) => slug === "fixture-rescue" ? organization : null;
  const checkoutDependencies: SponsorshipCheckoutDependencies = {
    async createCheckout(input) {
      checkoutInput = input;
      return { url: "https://checkout.stripe.test/session" };
    },
    findOrganization,
    async findResidentBySource(orgId, normalizedSource) {
      assert.equal(orgId, organization.id);
      assert.equal(normalizedSource, "https://rescue.example/dogs/mabel");
      return options.resident === undefined ? { id: "resident_mabel" } : options.resident;
    },
    async rateLimit() {
      return { allowed: !options.rateLimited, retryAfterSeconds: 30 };
    },
  };
  return {
    checkoutDependencies,
    findOrganization,
    get checkoutInput() { return checkoutInput; },
  };
}

function context(orgSlug = "fixture-rescue") {
  return { params: Promise.resolve({ orgSlug }) };
}

function jsonRequest(payload: Record<string, unknown>, origin = "https://rescue.example") {
  return new Request("http://localhost/api/public/fixture-rescue/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(payload),
  });
}

function formRequest(payload: Record<string, string>, origin = "https://rescue.example") {
  return new Request("http://localhost/api/public/fixture-rescue/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin },
    body: new URLSearchParams(payload),
  });
}

const validPayload = {
  source,
  sponsorName: "Avery Sponsor",
  sponsorEmail: "avery@example.com",
  returnTo: "https://rescue.example/dogs/mabel?campaign=spring#sponsor",
};

test("JSON checkout returns the Stripe URL, applies CORS, and preserves return query state", async () => {
  const deps = dependencies();
  const response = await createPublicCheckoutPostHandler(deps)(
    jsonRequest(validPayload),
    context(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://rescue.example");
  assert.equal(response.headers.get("vary"), "Origin");
  assert.deepEqual(await response.json(), { url: "https://checkout.stripe.test/session" });
  assert.equal(deps.checkoutInput?.residentId, "resident_mabel");
  assert.equal(deps.checkoutInput?.monthlyCents, 5000);
  assert.equal(
    deps.checkoutInput?.successUrl,
    "https://rescue.example/dogs/mabel?campaign=spring&sponsored=1&session_id={CHECKOUT_SESSION_ID}#sponsor",
  );
  assert.equal(
    deps.checkoutInput?.cancelUrl,
    "https://rescue.example/dogs/mabel?campaign=spring&checkout=canceled#sponsor",
  );
});

test("a foreign tier returns the invalid-tier error without creating checkout", async () => {
  const deps = dependencies();
  const response = await createPublicCheckoutPostHandler(deps)(
    jsonRequest({ ...validPayload, tier: "tier-from-another-rescue" }),
    context(),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid-tier" });
  assert.equal(deps.checkoutInput, undefined);
});

test("a return URL outside the rescue's configured origins is rejected", async () => {
  const deps = dependencies();
  const response = await createPublicCheckoutPostHandler(deps)(
    jsonRequest({ ...validPayload, returnTo: "https://attacker.example/collect" }),
    context(),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid" });
  assert.equal(deps.checkoutInput, undefined);
});

test("an unknown source redirects a form back with unavailable", async () => {
  const deps = dependencies({ resident: null });
  const response = await createPublicCheckoutPostHandler(deps)(
    formRequest(validPayload),
    context(),
  );

  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "https://rescue.example/dogs/mabel?campaign=spring&error=unavailable#sponsor",
  );
});

test("invalid form details return to the rescue with the shared invalid code", async () => {
  const deps = dependencies();
  const response = await createPublicCheckoutPostHandler(deps)(
    formRequest({ ...validPayload, sponsorEmail: "not-an-email" }),
    context(),
  );

  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /error=invalid/);
  assert.equal(deps.checkoutInput, undefined);
});

test("rate limiting returns the shared error vocabulary", async () => {
  const deps = dependencies({ rateLimited: true });
  const response = await createPublicCheckoutPostHandler(deps)(
    jsonRequest(validPayload),
    context(),
  );

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.deepEqual(await response.json(), { error: "rate-limited" });
  assert.equal(deps.checkoutInput, undefined);
});
