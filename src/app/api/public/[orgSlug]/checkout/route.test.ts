import assert from "node:assert/strict";
import test from "node:test";

import type { SponsorshipCheckoutDependencies } from "@/lib/sponsorship-checkout";
import type { SponsorshipCheckout } from "@/lib/stripe-billing";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { ResidentUnavailableError } = await import("@/lib/stripe-billing");
const {
  createPublicCheckoutOptionsHandler,
  createPublicCheckoutPostHandler,
} = await import("./route.ts");

const organization = {
  id: "org_rescue",
  settings: { allowedOrigins: ["https://rescue.example"] },
};
const source = "https://rescue.example/dogs/mabel?utm_source=mail";

type DependencyOptions = {
  checkout?: (input: SponsorshipCheckout) => Promise<{ url: string | null }>;
  rateLimited?: boolean;
  resident?: { id: string } | null;
};

function dependencies(options: DependencyOptions = {}) {
  let checkoutInput: SponsorshipCheckout | undefined;
  const findOrganization = async (slug: string) => slug === "fixture-rescue" ? organization : null;
  const checkoutDependencies: SponsorshipCheckoutDependencies = {
    async createCheckout(input) {
      checkoutInput = input;
      return options.checkout?.(input) ?? { url: "https://checkout.stripe.test/session" };
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
  assert.equal(
    deps.checkoutInput?.successUrl,
    "https://rescue.example/dogs/mabel?campaign=spring&sponsored=1&session_id={CHECKOUT_SESSION_ID}#sponsor",
  );
  assert.equal(
    deps.checkoutInput?.cancelUrl,
    "https://rescue.example/dogs/mabel?campaign=spring&checkout=canceled#sponsor",
  );
});

test("form checkout responds with a 303 redirect to Stripe", async () => {
  const deps = dependencies();
  const response = await createPublicCheckoutPostHandler(deps)(
    formRequest(validPayload),
    context(),
  );

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "https://checkout.stripe.test/session");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://rescue.example");
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

test("a resident that became unavailable redirects with the same server-action error", async () => {
  const deps = dependencies({
    checkout: async () => { throw new ResidentUnavailableError(); },
  });
  const response = await createPublicCheckoutPostHandler(deps)(
    formRequest(validPayload),
    context(),
  );

  assert.equal(response.status, 303);
  assert.match(response.headers.get("location") ?? "", /error=unavailable/);
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

test("preflight exposes checkout only to a configured origin", async () => {
  const deps = dependencies();
  const handler = createPublicCheckoutOptionsHandler(deps);
  const allowed = await handler(new Request("http://localhost", {
    method: "OPTIONS",
    headers: { Origin: "https://rescue.example" },
  }), context());
  const denied = await handler(new Request("http://localhost", {
    method: "OPTIONS",
    headers: { Origin: "https://other.example" },
  }), context());

  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://rescue.example");
  assert.equal(allowed.headers.get("access-control-allow-methods"), "POST, OPTIONS");
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
});
