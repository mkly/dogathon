import Stripe from "stripe";

import { prisma } from "@/lib/prisma";

export const SPONSORSHIP_MONTHLY_USD = 25;

/** The resident cannot be sponsored right now, as opposed to billing being unconfigured. */
export class ResidentUnavailableError extends Error {
  constructor() {
    super("Resident is unavailable");
    this.name = "ResidentUnavailableError";
  }
}

type ConnectedOrganization = {
  id: string;
  name: string;
  stripeAccountId: string | null;
  stripeDetailsSubmitted: boolean;
  stripeChargesEnabled: boolean;
};

type AvailableResident = {
  id: string;
  name: string;
  orgId: string;
};

export type SponsorshipCheckout = {
  orgId: string;
  residentId: string;
  sponsorName: string;
  sponsorEmail: string;
  successUrl: string;
  cancelUrl: string;
};

export interface BillingStore {
  getOrganization(orgId: string): Promise<ConnectedOrganization | null>;
  saveStripeAccount(orgId: string, stripeAccountId: string): Promise<void>;
  saveStripeAccountStatus(
    orgId: string,
    status: { detailsSubmitted: boolean; chargesEnabled: boolean },
  ): Promise<void>;
  getAvailableResident(orgId: string, residentId: string): Promise<AvailableResident | null>;
  /** Org-scoped lookup that ignores status, so a resident adopted mid-checkout still records. */
  getResident(orgId: string, residentId: string): Promise<AvailableResident | null>;
  activateSponsorship(input: {
    orgId: string;
    residentId: string;
    sponsorName: string;
    sponsorEmail: string;
    stripeAccountId: string;
    stripeCheckoutSessionId: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string | null;
  }): Promise<void>;
  endSponsorship(input: {
    orgId: string;
    stripeAccountId: string;
    stripeSubscriptionId: string;
  }): Promise<void>;
}

const prismaBillingStore: BillingStore = {
  async getOrganization(orgId) {
    return prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        name: true,
        stripeAccountId: true,
        stripeDetailsSubmitted: true,
        stripeChargesEnabled: true,
      },
    });
  },

  async saveStripeAccount(orgId, stripeAccountId) {
    await prisma.organization.update({ where: { id: orgId }, data: { stripeAccountId } });
  },

  async saveStripeAccountStatus(orgId, status) {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        stripeDetailsSubmitted: status.detailsSubmitted,
        stripeChargesEnabled: status.chargesEnabled,
      },
    });
  },

  async getAvailableResident(orgId, residentId) {
    return prisma.resident.findFirst({
      where: { id: residentId, orgId, status: "available" },
      select: { id: true, name: true, orgId: true },
    });
  },

  async getResident(orgId, residentId) {
    return prisma.resident.findFirst({
      where: { id: residentId, orgId },
      select: { id: true, name: true, orgId: true },
    });
  },

  async activateSponsorship(input) {
    const email = input.sponsorEmail.trim().toLowerCase();

    await prisma.$transaction(async (tx) => {
      const sponsor = await tx.sponsor.upsert({
        where: { email },
        update: { name: input.sponsorName },
        create: { email, name: input.sponsorName },
      });

      await tx.sponsorship.upsert({
        where: { stripeCheckoutSessionId: input.stripeCheckoutSessionId },
        update: {
          sponsorId: sponsor.id,
          status: "active",
          endedAt: null,
          endedReason: null,
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripeCustomerId: input.stripeCustomerId,
        },
        create: {
          orgId: input.orgId,
          residentId: input.residentId,
          sponsorId: sponsor.id,
          monthlyUsd: SPONSORSHIP_MONTHLY_USD,
          status: "active",
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
          stripeSubscriptionId: input.stripeSubscriptionId,
          stripeCustomerId: input.stripeCustomerId,
        },
      });
    });
  },

  async endSponsorship(input) {
    await prisma.sponsorship.updateMany({
      where: {
        orgId: input.orgId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        status: "active",
        organization: { stripeAccountId: input.stripeAccountId },
      },
      data: { status: "ended", endedAt: new Date(), endedReason: "stripe_subscription_canceled" },
    });
  },
};

let stripeClient: Stripe | undefined;

function stripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!apiKey) throw new Error("STRIPE_SECRET_KEY is required for billing");
  stripeClient ??= new Stripe(apiKey, { httpClient: Stripe.createFetchHttpClient() });
  return stripeClient;
}

export function stripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is required for billing webhooks");
  return secret;
}

export function constructStripeEvent(payload: string, signature: string, secret: string) {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

export async function createConnectOnboardingLink(
  orgId: string,
  urls: { refreshUrl: string; returnUrl: string },
  store: BillingStore = prismaBillingStore,
) {
  const organization = await store.getOrganization(orgId);
  if (!organization) throw new Error("Organization not found");

  let accountId = organization.stripeAccountId;
  if (!accountId) {
    const account = await stripe().accounts.create({
      type: "express",
      business_profile: { name: organization.name },
      metadata: { orgId },
    });
    accountId = account.id;
    await store.saveStripeAccount(orgId, accountId);
  }

  return stripe().accountLinks.create({
    account: accountId,
    refresh_url: urls.refreshUrl,
    return_url: urls.returnUrl,
    type: "account_onboarding",
  });
}

export async function refreshConnectStatus(
  orgId: string,
  store: BillingStore = prismaBillingStore,
) {
  const organization = await store.getOrganization(orgId);
  if (!organization?.stripeAccountId) throw new Error("Stripe onboarding has not started");
  const account = await stripe().accounts.retrieve(organization.stripeAccountId);
  const status = {
    id: account.id,
    detailsSubmitted: account.details_submitted,
    chargesEnabled: account.charges_enabled,
  };
  await store.saveStripeAccountStatus(orgId, status);
  return status;
}

export async function createStripeCheckout(
  input: SponsorshipCheckout,
  store: BillingStore = prismaBillingStore,
) {
  const [organization, resident] = await Promise.all([
    store.getOrganization(input.orgId),
    store.getAvailableResident(input.orgId, input.residentId),
  ]);
  if (!organization?.stripeAccountId || !organization.stripeChargesEnabled) {
    throw new Error("This organization is not ready to accept sponsorship payments");
  }
  if (!resident) throw new ResidentUnavailableError();

  const session = await stripe().checkout.sessions.create(
    {
      mode: "subscription",
      customer_email: input.sponsorEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: SPONSORSHIP_MONTHLY_USD * 100,
            recurring: { interval: "month" },
            product_data: { name: `Sponsor ${resident.name}` },
          },
          quantity: 1,
        },
      ],
      metadata: {
        orgId: input.orgId,
        residentId: input.residentId,
        sponsorName: input.sponsorName,
        sponsorEmail: input.sponsorEmail,
      },
      subscription_data: {
        metadata: {
          orgId: input.orgId,
          residentId: input.residentId,
        },
      },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    { stripeAccount: organization.stripeAccountId },
  );
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { id: session.id, url: session.url };
}

export async function createBillingPortalSession(input: {
  accountId: string;
  customerId: string;
  returnUrl: string;
}) {
  return stripe().billingPortal.sessions.create(
    {
      customer: input.customerId,
      return_url: input.returnUrl,
    },
    { stripeAccount: input.accountId },
  );
}

function id(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function processStripeEvent(
  event: Stripe.Event,
  store: BillingStore = prismaBillingStore,
) {
  if (event.type === "account.updated") {
    const account = event.data.object;
    const orgId = account.metadata?.orgId;
    if (!orgId || event.account !== account.id) return;
    const organization = await store.getOrganization(orgId);
    if (organization?.stripeAccountId !== account.id) return;
    await store.saveStripeAccountStatus(orgId, {
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
    });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { orgId, residentId, sponsorName, sponsorEmail } = session.metadata ?? {};
    const subscriptionId = id(session.subscription);
    if (!event.account || !orgId || !residentId || !sponsorName || !sponsorEmail || !subscriptionId) {
      return;
    }
    const [organization, resident] = await Promise.all([
      store.getOrganization(orgId),
      store.getResident(orgId, residentId),
    ]);
    if (organization?.stripeAccountId !== event.account || !resident) return;
    await store.activateSponsorship({
      orgId,
      residentId,
      sponsorName,
      sponsorEmail,
      stripeAccountId: event.account,
      stripeCheckoutSessionId: session.id,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: id(session.customer),
    });
    return;
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const orgId = subscription.metadata.orgId;
    if (!event.account || !orgId) return;
    const organization = await store.getOrganization(orgId);
    if (organization?.stripeAccountId !== event.account) return;
    await store.endSponsorship({
      orgId,
      stripeAccountId: event.account,
      stripeSubscriptionId: subscription.id,
    });
  }
}
