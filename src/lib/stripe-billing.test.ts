import assert from "node:assert/strict";
import { after, afterEach, before, test } from "node:test";

import Stripe from "stripe";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import {
  type BillingStore,
  ResidentUnavailableError,
  constructStripeEvent,
  createBillingPortalSession,
  connectAccountStatus,
  createConnectOnboardingLink,
  createStripeCheckout,
  processStripeEvent,
  refreshConnectStatus,
} from "./stripe-billing";
import { env } from "./env.ts";

env.STRIPE_SECRET_KEY = "sk_test_fixture";
env.features = Object.freeze({ ...env.features, stripe: true });

const stripeApi = "https://api.stripe.com";

function formData(request: Request) {
  return request.text().then((body) => new URLSearchParams(body));
}

const server = setupServer(
  http.post(`${stripeApi}/v1/accounts`, async ({ request }) => {
    const body = await formData(request);
    assert.equal(body.get("type"), "express");
    assert.equal(body.get("business_profile[name]"), "Fixture Rescue");
    assert.equal(body.get("metadata[orgId]"), "org_rescue");
    assert.equal(body.get("capabilities[card_payments][requested]"), "true");
    assert.equal(body.get("capabilities[transfers][requested]"), "true");
    return HttpResponse.json({ id: "acct_fixture_rescue", object: "account" });
  }),
  http.post(`${stripeApi}/v1/accounts/:accountId`, async ({ params, request }) => {
    const body = await formData(request);
    assert.equal(params.accountId, "acct_fixture_rescue");
    assert.equal(body.get("capabilities[card_payments][requested]"), "true");
    assert.equal(body.get("capabilities[transfers][requested]"), "true");
    return HttpResponse.json({ id: "acct_fixture_rescue", object: "account" });
  }),
  http.post(`${stripeApi}/v1/account_links`, async ({ request }) => {
    const body = await formData(request);
    assert.equal(body.get("account"), "acct_fixture_rescue");
    assert.equal(body.get("type"), "account_onboarding");
    return HttpResponse.json({
      object: "account_link",
      url: "https://connect.stripe.test/onboard/acct_fixture_rescue",
    });
  }),
  http.get(`${stripeApi}/v1/accounts/:accountId`, ({ params }) => {
    assert.equal(params.accountId, "acct_fixture_rescue");
    return HttpResponse.json({
      id: "acct_fixture_rescue",
      object: "account",
      details_submitted: true,
      charges_enabled: true,
      capabilities: { card_payments: "active", transfers: "active" },
    });
  }),
  http.post(`${stripeApi}/v1/checkout/sessions`, () => HttpResponse.json({
    id: "cs_fixture",
    object: "checkout.session",
    url: "https://checkout.stripe.test/cs_fixture",
  })),
  http.post(`${stripeApi}/v1/billing_portal/sessions`, () => HttpResponse.json({
    id: "bps_fixture",
    object: "billing_portal.session",
    url: "https://billing.stripe.test/session_fixture",
  })),
);

before(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
after(() => server.close());

type SponsorshipRecord = Parameters<BillingStore["activateSponsorship"]>[0] & {
  sponsorId: string;
  status: "active" | "ended";
};

type SponsorRecord = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  channel: "email" | "sms" | "both";
  userId: string | null;
};

class MemoryBillingStore implements BillingStore {
  organization = {
    id: "org_rescue",
    name: "Fixture Rescue",
    stripeAccountId: null as string | null,
    stripeDetailsSubmitted: false,
    stripeChargesEnabled: false,
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

  async activateSponsorship(input: Parameters<BillingStore["activateSponsorship"]>[0]) {
    const email = input.sponsorEmail.trim().toLowerCase();
    const existing = this.sponsors.get(email);
    const sponsor = existing
      ? { ...existing, name: input.sponsorName }
      : {
          id: `sponsor_${this.sponsors.size + 1}`,
          email,
          name: input.sponsorName,
          phone: null,
          channel: "email" as const,
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
      (record) => record.orgId === input.orgId
        && record.stripeAccountId === input.stripeAccountId
        && record.stripeSubscriptionId === input.stripeSubscriptionId,
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
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return constructStripeEvent(payload, signature, secret);
}

test("Stripe SDK checkout request is a $25 direct subscription on the connected account", async () => {
  server.use(http.post(`${stripeApi}/v1/checkout/sessions`, async ({ request }) => {
    const body = await formData(request);
    assert.equal(body.get("mode"), "subscription");
    assert.equal(body.get("line_items[0][price_data][unit_amount]"), "2500");
    assert.equal(body.get("line_items[0][price_data][recurring][interval]"), "month");
    assert.equal(body.get("line_items[0][price_data][product_data][name]"), "Sponsor Mabel");
    assert.equal(body.get("subscription_data[metadata][orgId]"), "org_rescue");
    assert.equal(request.headers.get("stripe-account"), "acct_fixture_rescue");
    return HttpResponse.json({
      id: "cs_sdk_fixture",
      object: "checkout.session",
      url: "https://checkout.stripe.test/cs_sdk_fixture",
    });
  }));

  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";
  store.organization.stripeChargesEnabled = true;
  const checkout = await createStripeCheckout({
    orgId: "org_rescue",
    residentId: "companion_mabel",
    sponsorName: "Avery Sponsor",
    sponsorEmail: "avery@example.com",
    successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel",
  }, store);

  assert.equal(checkout.id, "cs_sdk_fixture");
});

test("Stripe SDK billing portal uses the sponsorship customer on the connected account", async () => {
  server.use(http.post(`${stripeApi}/v1/billing_portal/sessions`, async ({ request }) => {
    const body = await formData(request);
    assert.equal(body.get("customer"), "cus_fixture_sponsor");
    assert.equal(body.get("return_url"), "https://app.test/account");
    assert.equal(request.headers.get("stripe-account"), "acct_fixture_rescue");
    return HttpResponse.json({
      id: "bps_fixture",
      object: "billing_portal.session",
      url: "https://billing.stripe.test/session_fixture",
    });
  }));

  const portal = await createBillingPortalSession({
    accountId: "acct_fixture_rescue",
    customerId: "cus_fixture_sponsor",
    returnUrl: "https://app.test/account",
  });

  assert.equal(portal.url, "https://billing.stripe.test/session_fixture");
});

test("resuming onboarding re-requests card payments on an existing connected account", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";

  const onboarding = await createConnectOnboardingLink(
    "org_rescue",
    { refreshUrl: "https://app.test/connect/refresh", returnUrl: "https://app.test/connect/return" },
    store,
  );
  assert.equal(onboarding.url, "https://connect.stripe.test/onboard/acct_fixture_rescue");
});

test("an account is only chargeable once Stripe activates card payments on it", () => {
  const account = {
    details_submitted: true,
    charges_enabled: true,
    capabilities: { transfers: "active" },
  } as unknown as Stripe.Account;
  assert.deepEqual(connectAccountStatus(account), {
    detailsSubmitted: true,
    chargesEnabled: false,
    verifying: false,
    blockers: [],
  });
});

test("Stripe's outstanding requirements are surfaced as readable blockers", () => {
  const account = {
    details_submitted: true,
    charges_enabled: false,
    capabilities: { card_payments: "inactive", transfers: "active" },
    requirements: {
      errors: [
        {
          code: "verification_failed_keyed_identity",
          reason: "The person's keyed-in identity information could not be verified.",
          requirement: "individual.verification.document",
        },
      ],
      past_due: ["individual.verification.document"],
      currently_due: ["individual.verification.document", "business_profile.url"],
      pending_verification: ["individual.id_number"],
    },
  } as unknown as Stripe.Account;
  assert.equal(connectAccountStatus(account).verifying, true);
  assert.deepEqual(connectAccountStatus(account).blockers, [
    "The person's keyed-in identity information could not be verified.",
    "Stripe still needs: business profile url.",
    "Stripe is verifying details it already has; this can take a few minutes.",
  ]);
});

test("Stripe Connect onboarding, checkout, and signed webhooks maintain sponsorship state", async () => {
  const store = new MemoryBillingStore();

  const onboarding = await createConnectOnboardingLink(
    "org_rescue",
    { refreshUrl: "https://app.test/connect/refresh", returnUrl: "https://app.test/connect/return" },
    store,
  );
  assert.equal(onboarding.url, "https://connect.stripe.test/onboard/acct_fixture_rescue");
  assert.equal(store.organization.stripeAccountId, "acct_fixture_rescue");

  const connected = await refreshConnectStatus("org_rescue", store);
  assert.equal(connected.detailsSubmitted, true);
  assert.equal(store.organization.stripeChargesEnabled, true);

  const checkout = await createStripeCheckout(
    {
      orgId: "org_rescue",
      residentId: "companion_mabel",
      sponsorName: "Avery Sponsor",
      sponsorEmail: "avery@example.com",
      successUrl: "https://app.test/companions/companion_mabel?sponsored=1",
      cancelUrl: "https://app.test/companions/companion_mabel?checkout=canceled",
    },
    store,
  );
  assert.equal(checkout.url, "https://checkout.stripe.test/cs_fixture");

  await processStripeEvent(signedEvent({
    id: "cs_fixture",
    object: "checkout.session",
    customer: "cus_fixture",
    metadata: {
      orgId: "org_rescue",
      residentId: "companion_mabel",
      sponsorName: "Avery Sponsor",
      sponsorEmail: "avery@example.com",
    },
    mode: "subscription",
    subscription: "sub_fixture",
  }, "checkout.session.completed"), store);

  assert.deepEqual(store.sponsorships.get("cs_fixture"), {
    orgId: "org_rescue",
    residentId: "companion_mabel",
    sponsorName: "Avery Sponsor",
    sponsorEmail: "avery@example.com",
    stripeAccountId: "acct_fixture_rescue",
    stripeCheckoutSessionId: "cs_fixture",
    stripeSubscriptionId: "sub_fixture",
    stripeCustomerId: "cus_fixture",
    sponsorId: "sponsor_1",
    status: "active",
  });
  assert.deepEqual(store.sponsors.get("avery@example.com"), {
    id: "sponsor_1",
    email: "avery@example.com",
    name: "Avery Sponsor",
    phone: null,
    channel: "email",
    userId: null,
  });

  await processStripeEvent(signedEvent({
    id: "sub_fixture",
    object: "subscription",
    metadata: { orgId: "org_rescue", residentId: "companion_mabel" },
  }, "customer.subscription.deleted"), store);
  assert.equal(store.sponsorships.get("cs_fixture")?.status, "ended");
});

test("webhooks ignore a connected account that does not belong to the organization", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_another_rescue";
  store.organization.stripeChargesEnabled = true;

  await processStripeEvent(signedEvent({
    id: "cs_wrong_account",
    object: "checkout.session",
    customer: "cus_fixture",
    metadata: {
      orgId: "org_rescue",
      residentId: "companion_mabel",
      sponsorName: "Mallory",
      sponsorEmail: "mallory@example.com",
    },
    mode: "subscription",
    subscription: "sub_wrong_account",
  }, "checkout.session.completed"), store);

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
        successUrl: "https://app.test/success",
        cancelUrl: "https://app.test/cancel",
      },
      store,
    ),
    ResidentUnavailableError,
  );
});

test("a resident adopted mid-checkout still records the paid sponsorship", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";
  store.organization.stripeChargesEnabled = true;
  store.residentAvailable = false;

  await processStripeEvent(signedEvent({
    id: "cs_adopted",
    object: "checkout.session",
    customer: "cus_fixture",
    metadata: {
      orgId: "org_rescue",
      residentId: "companion_mabel",
      sponsorName: "Avery Sponsor",
      sponsorEmail: "avery@example.com",
    },
    mode: "subscription",
    subscription: "sub_adopted",
  }, "checkout.session.completed"), store);

  assert.equal(store.sponsorships.get("cs_adopted")?.status, "active");
});

test("checkout completion reuses a sponsor by normalized email without linking a user", async () => {
  const store = new MemoryBillingStore();
  store.organization.stripeAccountId = "acct_fixture_rescue";

  for (const [sessionId, email] of [["cs_first", "Sponsor@Example.com"], ["cs_second", "sponsor@example.com"]]) {
    await processStripeEvent(signedEvent({
      id: sessionId,
      object: "checkout.session",
      customer: `cus_${sessionId}`,
      metadata: {
        orgId: "org_rescue",
        residentId: "companion_mabel",
        sponsorName: "Avery Sponsor",
        sponsorEmail: email,
      },
      mode: "subscription",
      subscription: `sub_${sessionId}`,
    }, "checkout.session.completed"), store);
  }

  assert.equal(store.sponsors.size, 1);
  assert.equal(store.sponsors.get("sponsor@example.com")?.userId, null);
  assert.equal(store.sponsorships.get("cs_first")?.sponsorId, "sponsor_1");
  assert.equal(store.sponsorships.get("cs_second")?.sponsorId, "sponsor_1");
});
