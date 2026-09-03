import assert from "node:assert/strict";
import test from "node:test";

import Stripe from "stripe";

import {
  type BillingStore,
  ResidentUnavailableError,
  constructStripeEvent,
  createConnectOnboardingLink,
  createStripeCheckout,
  processStripeEvent,
  refreshConnectStatus,
  type SponsorshipCheckout,
  type StripeBillingGateway,
  StripeSdkGateway,
} from "./stripe-billing";

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

class FixtureStripeGateway implements StripeBillingGateway {
  checkoutInput?: SponsorshipCheckout & { accountId: string; residentName: string };

  async createExpressAccount(input: { orgId: string; organizationName: string }) {
    assert.deepEqual(input, { orgId: "org_rescue", organizationName: "Fixture Rescue" });
    return { id: "acct_fixture_rescue" };
  }

  async createAccountLink(input: { accountId: string; refreshUrl: string; returnUrl: string }) {
    assert.equal(input.accountId, "acct_fixture_rescue");
    return { url: "https://connect.stripe.test/onboard/acct_fixture_rescue" };
  }

  async retrieveAccount(accountId: string) {
    assert.equal(accountId, "acct_fixture_rescue");
    return { id: accountId, detailsSubmitted: true, chargesEnabled: true };
  }

  async createSubscriptionCheckout(
    input: SponsorshipCheckout & { accountId: string; residentName: string },
  ) {
    this.checkoutInput = input;
    return { id: "cs_fixture", url: "https://checkout.stripe.test/cs_fixture" };
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
  let checkoutParams: Stripe.Checkout.SessionCreateParams | undefined;
  let requestOptions: Stripe.RequestOptions | undefined;
  const stripeFixture = {
    checkout: {
      sessions: {
        create: async (params: Stripe.Checkout.SessionCreateParams, options: Stripe.RequestOptions) => {
          checkoutParams = params;
          requestOptions = options;
          return { id: "cs_sdk_fixture", url: "https://checkout.stripe.test/cs_sdk_fixture" };
        },
      },
    },
  } as unknown as Stripe;

  const gateway = new StripeSdkGateway(stripeFixture);
  await gateway.createSubscriptionCheckout({
    accountId: "acct_fixture_rescue",
    orgId: "org_rescue",
    residentId: "companion_mabel",
    residentName: "Mabel",
    sponsorName: "Avery Sponsor",
    sponsorEmail: "avery@example.com",
    successUrl: "https://app.test/success",
    cancelUrl: "https://app.test/cancel",
  });

  assert.equal(checkoutParams?.mode, "subscription");
  assert.equal(checkoutParams?.line_items?.[0]?.price_data?.unit_amount, 2_500);
  assert.equal(checkoutParams?.line_items?.[0]?.price_data?.recurring?.interval, "month");
  assert.equal(checkoutParams?.subscription_data?.metadata?.orgId, "org_rescue");
  assert.equal(requestOptions?.stripeAccount, "acct_fixture_rescue");
});

test("Stripe Connect onboarding, checkout, and signed webhooks maintain sponsorship state", async () => {
  const store = new MemoryBillingStore();
  const gateway = new FixtureStripeGateway();

  const onboarding = await createConnectOnboardingLink(
    "org_rescue",
    { refreshUrl: "https://app.test/connect/refresh", returnUrl: "https://app.test/connect/return" },
    gateway,
    store,
  );
  assert.equal(onboarding.url, "https://connect.stripe.test/onboard/acct_fixture_rescue");
  assert.equal(store.organization.stripeAccountId, "acct_fixture_rescue");

  const connected = await refreshConnectStatus("org_rescue", gateway, store);
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
    gateway,
    store,
  );
  assert.equal(checkout.url, "https://checkout.stripe.test/cs_fixture");
  assert.equal(gateway.checkoutInput?.accountId, "acct_fixture_rescue");
  assert.equal(gateway.checkoutInput?.residentName, "Mabel");

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
      new FixtureStripeGateway(),
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
