import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import Stripe from "stripe";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import {
  type BillingStore,
  ResidentUnavailableError,
  constructStripeEvent,
  createConnectOnboardingLink,
  createStripeCheckout,
  processStripeEvent,
  refreshConnectStatus,
} from "./stripe-billing";
import { env } from "./env.ts";

env.STRIPE_SECRET_KEY = "sk_test_fixture";
env.features = Object.freeze({ ...env.features, stripe: true });

const stripeApi = "https://api.stripe.com";

const server = setupServer(
  http.post(`${stripeApi}/v1/accounts`, () =>
    HttpResponse.json({ id: "acct_fixture_rescue", object: "account" }),
  ),
  http.post(`${stripeApi}/v1/accounts/:accountId`, () =>
    HttpResponse.json({ id: "acct_fixture_rescue", object: "account" }),
  ),
  http.post(`${stripeApi}/v1/account_links`, () =>
    HttpResponse.json({
      object: "account_link",
      url: "https://connect.stripe.test/onboard/acct_fixture_rescue",
    }),
  ),
  http.get(`${stripeApi}/v1/accounts/:accountId`, () =>
    HttpResponse.json({
      id: "acct_fixture_rescue",
      object: "account",
      details_submitted: true,
      charges_enabled: true,
      capabilities: { card_payments: "active", transfers: "active" },
    }),
  ),
  http.post(`${stripeApi}/v1/checkout/sessions`, () =>
    HttpResponse.json({
      id: "cs_fixture",
      object: "checkout.session",
      url: "https://checkout.stripe.test/cs_fixture",
    }),
  ),
);

before(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
after(() => server.close());

type SponsorshipRecord = Parameters<BillingStore["activateSponsorship"]>[0] & {
  sponsorId: string;
  status: "active" | "awaiting" | "ended";
};

type SponsorRecord = {
  id: string;
  email: string;
  name: string;
  userId: string | null;
};

class MemoryBillingStore implements BillingStore {
  organization = {
    id: "org_rescue",
    name: "Fixture Rescue",
    stripeAccountId: null as string | null,
    stripeDetailsSubmitted: false,
    stripeChargesEnabled: false,
    sponsorshipTiers: [{ monthlyCents: 3750 }],
  };

  resident = { id: "companion_mabel", name: "Mabel", orgId: "org_rescue" };
  sponsors = new Map<string, SponsorRecord>();
  sponsorships = new Map<string, SponsorshipRecord>();

  async getOrganization(orgId: string) {
    return orgId === this.organization.id ? { ...this.organization } : null;
  }

  async saveStripeAccount(orgId: string, stripeAccountId: string) {
    assert.equal(orgId, this.organization.id);
    this.organization.stripeAccountId = stripeAccountId;
  }

  async saveStripeAccountStatus(
    orgId: string,
    status: { detailsSubmitted: boolean; chargesEnabled: boolean },
  ) {
    assert.equal(orgId, this.organization.id);
    this.organization.stripeDetailsSubmitted = status.detailsSubmitted;
    this.organization.stripeChargesEnabled = status.chargesEnabled;
  }

  residentAvailable = true;

  async getAvailableResident(orgId: string, residentId: string) {
    return this.residentAvailable ? this.getResident(orgId, residentId) : null;
  }

  async getResident(orgId: string, residentId: string) {
    return orgId === this.resident.orgId && residentId === this.resident.id
      ? { ...this.resident }
      : null;
  }

  async activateSponsorship(
    input: Parameters<BillingStore["activateSponsorship"]>[0],
  ) {
    const email = input.sponsorEmail.trim().toLowerCase();
    const existing = this.sponsors.get(email);
    const sponsor = existing
      ? existing
      : {
          id: `sponsor_${this.sponsors.size + 1}`,
          email,
          name: input.sponsorName,
          userId: null,
        };
    this.sponsors.set(email, sponsor);
    this.sponsorships.set(input.stripeCheckoutSessionId, {
      ...input,
      sponsorId: sponsor.id,
      status: "active",
    });
  }

  async endSponsorship(input: Parameters<BillingStore["endSponsorship"]>[0]) {
    const sponsorship = [...this.sponsorships.values()].find(
      (record) =>
        record.orgId === input.orgId &&
        record.stripeAccountId === input.stripeAccountId &&
        record.stripeSubscriptionId === input.stripeSubscriptionId,
    );
    if (sponsorship) sponsorship.status = "ended";
  }
}

function signedEvent(object: Record<string, unknown>, type: string) {
  const secret = "whsec_fixture_secret";
  const payload = JSON.stringify({
    id: `evt_${type.replaceAll(".", "_")}`,
    object: "event",
    account: "acct_fixture_rescue",
    api_version: "2026-08-27.basil",
    created: 1_787_680_000,
    data: { object },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });
  return constructStripeEvent(payload, signature, secret);
}

test("Stripe Connect onboarding, checkout, and signed webhooks maintain sponsorship state", async () => {
  const store = new MemoryBillingStore();

  const onboarding = await createConnectOnboardingLink(
    "org_rescue",
    {
      refreshUrl: "https://app.test/connect/refresh",
      returnUrl: "https://app.test/connect/return",
    },
    store,
  );
  assert.equal(
    onboarding.url,
    "https://connect.stripe.test/onboard/acct_fixture_rescue",
  );
  assert.equal(store.organization.stripeAccountId, "acct_fixture_rescue");

  const connected = await refreshConnectStatus("org_rescue", store);
  assert.equal(connected.detailsSubmitted, true);
  assert.equal(store.organization.stripeChargesEnabled, true);

  server.use(
    http.post(`${stripeApi}/v1/checkout/sessions`, async ({ request }) => {
      const checkoutRequest = new URLSearchParams(await request.text());
      assert.equal(
        checkoutRequest.get("line_items[0][price_data][product_data][name]"),
        "Sponsorship with Fixture Rescue",
      );
      assert.equal(
        checkoutRequest.get("metadata[residentId]"),
        "companion_mabel",
      );
      assert.equal(
        checkoutRequest.get("subscription_data[metadata][residentId]"),
        "companion_mabel",
      );
      return HttpResponse.json({
        id: "cs_fixture",
        object: "checkout.session",
        url: "https://checkout.stripe.test/cs_fixture",
      });
    }),
  );

  const checkout = await createStripeCheckout(
    {
      orgId: "org_rescue",
      residentId: "companion_mabel",
      sponsorName: "Avery Sponsor",
      sponsorEmail: "avery@example.com",
      monthlyCents: 3750,
      successUrl: "https://app.test/companions/companion_mabel?sponsored=1",
      cancelUrl:
        "https://app.test/companions/companion_mabel?checkout=canceled",
    },
    store,
  );
  assert.equal(checkout.url, "https://checkout.stripe.test/cs_fixture");

  await processStripeEvent(
    signedEvent(
      {
        id: "cs_fixture",
        object: "checkout.session",
        customer: "cus_fixture",
        metadata: {
          orgId: "org_rescue",
          residentId: "companion_mabel",
          sponsorName: "Avery Sponsor",
          sponsorEmail: "avery@example.com",
          monthlyCents: "3750",
        },
        mode: "subscription",
        subscription: "sub_fixture",
      },
      "checkout.session.completed",
    ),
    store,
  );

  assert.deepEqual(store.sponsorships.get("cs_fixture"), {
    orgId: "org_rescue",
    residentId: "companion_mabel",
    sponsorName: "Avery Sponsor",
    sponsorEmail: "avery@example.com",
    stripeAccountId: "acct_fixture_rescue",
    stripeCheckoutSessionId: "cs_fixture",
    stripeSubscriptionId: "sub_fixture",
    stripeCustomerId: "cus_fixture",
    monthlyCents: 3750,
    sponsorId: "sponsor_1",
    status: "active",
  });
  assert.deepEqual(store.sponsors.get("avery@example.com"), {
    id: "sponsor_1",
    email: "avery@example.com",
    name: "Avery Sponsor",
    userId: null,
  });

  store.sponsorships.get("cs_fixture")!.status = "awaiting";
  await processStripeEvent(
    signedEvent(
      {
        id: "sub_fixture",
        object: "subscription",
        metadata: { orgId: "org_rescue", residentId: "companion_mabel" },
      },
      "customer.subscription.deleted",
    ),
    store,
  );
  assert.equal(store.sponsorships.get("cs_fixture")?.status, "ended");

  await processStripeEvent(
    signedEvent(
      {
        id: "sub_fixture",
        object: "subscription",
        metadata: { orgId: "org_rescue", residentId: "companion_mabel" },
      },
      "customer.subscription.deleted",
    ),
    store,
  );
  assert.equal(store.sponsorships.get("cs_fixture")?.status, "ended");
});

test("webhooks ignore a connected account that does not belong to the organization", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_another_rescue";
  store.organization.stripeChargesEnabled = true;

  await processStripeEvent(
    signedEvent(
      {
        id: "cs_wrong_account",
        object: "checkout.session",
        customer: "cus_fixture",
        metadata: {
          orgId: "org_rescue",
          residentId: "companion_mabel",
          sponsorName: "Mallory",
          sponsorEmail: "mallory@example.com",
          monthlyCents: "3750",
        },
        mode: "subscription",
        subscription: "sub_wrong_account",
      },
      "checkout.session.completed",
    ),
    store,
  );

  assert.equal(store.sponsorships.size, 0);
});

test("checkout refuses an unavailable resident with a distinguishable error", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";
  store.organization.stripeChargesEnabled = true;
  store.residentAvailable = false;

  await assert.rejects(
    createStripeCheckout(
      {
        orgId: "org_rescue",
        residentId: "companion_mabel",
        sponsorName: "Avery Sponsor",
        sponsorEmail: "avery@example.com",
        monthlyCents: 3750,
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      },
      store,
    ),
    ResidentUnavailableError,
  );
});

test("a resident made unavailable mid-checkout still records the paid sponsorship", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";
  store.organization.stripeChargesEnabled = true;
  store.residentAvailable = false;

  await processStripeEvent(
    signedEvent(
      {
        id: "cs_adopted",
        object: "checkout.session",
        customer: "cus_fixture",
        metadata: {
          orgId: "org_rescue",
          residentId: "companion_mabel",
          sponsorName: "Avery Sponsor",
          sponsorEmail: "avery@example.com",
          monthlyCents: "3750",
        },
        mode: "subscription",
        subscription: "sub_adopted",
      },
      "checkout.session.completed",
    ),
    store,
  );

  assert.equal(store.sponsorships.get("cs_adopted")?.status, "active");
});

test("checkout completion reuses a sponsor by normalized email without linking a user", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";

  for (const [sessionId, email] of [
    ["cs_first", "Sponsor@Example.com"],
    ["cs_second", "sponsor@example.com"],
  ]) {
    await processStripeEvent(
      signedEvent(
        {
          id: sessionId,
          object: "checkout.session",
          customer: `cus_${sessionId}`,
          metadata: {
            orgId: "org_rescue",
            residentId: "companion_mabel",
            sponsorName: "Avery Sponsor",
            sponsorEmail: email,
            monthlyCents: "3750",
          },
          mode: "subscription",
          subscription: `sub_${sessionId}`,
        },
        "checkout.session.completed",
      ),
      store,
    );
  }

  assert.equal(store.sponsors.size, 1);
  assert.equal(store.sponsors.get("sponsor@example.com")?.userId, null);
  assert.equal(store.sponsorships.get("cs_first")?.sponsorId, "sponsor_1");
  assert.equal(store.sponsorships.get("cs_second")?.sponsorId, "sponsor_1");
});

test("checkout completion does not overwrite an existing sponsor name", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";
  store.sponsors.set("sponsor@example.com", {
    id: "sponsor_1",
    email: "sponsor@example.com",
    name: "Original Sponsor Name",
    userId: null,
  });

  await processStripeEvent(
    signedEvent(
      {
        id: "cs_keep_existing_sponsor_name",
        object: "checkout.session",
        customer: "cus_fixture",
        metadata: {
          orgId: "org_rescue",
          residentId: "companion_mabel",
          sponsorName: "Checkout Form Name",
          sponsorEmail: "Sponsor@Example.com",
          monthlyCents: "3750",
        },
        mode: "subscription",
        subscription: "sub_keep_existing_sponsor_name",
      },
      "checkout.session.completed",
    ),
    store,
  );

  assert.equal(
    store.sponsors.get("sponsor@example.com")?.name,
    "Original Sponsor Name",
  );
});
