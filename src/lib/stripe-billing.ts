import Stripe from "stripe";

import { env } from "./env.ts";

import { prisma } from "@/lib/prisma";

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
  monthlyCents: number;
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
  getAvailableResident(
    orgId: string,
    residentId: string,
  ): Promise<AvailableResident | null>;
  /** Org-scoped lookup that ignores availability, so a resident that became unavailable mid-checkout still records. */
  getResident(
    orgId: string,
    residentId: string,
  ): Promise<AvailableResident | null>;
  activateSponsorship(input: {
    orgId: string;
    residentId: string;
    sponsorName: string;
    sponsorEmail: string;
    stripeAccountId: string;
    stripeCheckoutSessionId: string;
    stripeSubscriptionId: string;
    stripeCustomerId: string | null;
    monthlyCents: number;
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
    await prisma.organization.update({
      where: { id: orgId },
      data: { stripeAccountId },
    });
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
      where: { id: residentId, orgId, available: true },
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
        update: {},
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
          monthlyCents: input.monthlyCents,
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
        status: { not: "ended" },
        organization: { stripeAccountId: input.stripeAccountId },
      },
      data: { status: "ended", endedAt: new Date(), endedReason: "canceled" },
    });
  },
};

let stripeClient: Stripe | undefined;

function stripe() {
  if (!env.features.stripe)
    throw new Error("STRIPE_SECRET_KEY is required for billing");
  const apiKey = env.STRIPE_SECRET_KEY!;
  stripeClient ??= new Stripe(apiKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return stripeClient;
}

export function stripeWebhookSecret() {
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret)
    throw new Error("STRIPE_WEBHOOK_SECRET is required for billing webhooks");
  return secret;
}

export function constructStripeEvent(
  payload: string,
  signature: string,
  secret: string,
) {
  return Stripe.webhooks.constructEvent(payload, signature, secret);
}

// Checkout runs as a direct charge on the rescue's account, which needs card_payments;
// transfers keeps payouts available. Both must be requested, not assumed from the
// platform's Connect defaults.
const CONNECT_CAPABILITIES = {
  card_payments: { requested: true },
  transfers: { requested: true },
} satisfies Stripe.AccountCreateParams.Capabilities;

export function connectAccountStatus(account: Stripe.Account) {
  return {
    detailsSubmitted: account.details_submitted,
    chargesEnabled:
      account.charges_enabled &&
      account.capabilities?.card_payments === "active",
    verifying: (account.requirements?.pending_verification?.length ?? 0) > 0,
    blockers: connectBlockers(account),
  };
}

/** What Stripe says still stands between this account and card payments, in its
 *  own words where it gives them, so staff see the real hold-up rather than a
 *  generic "still verifying". */
function connectBlockers(account: Stripe.Account): string[] {
  const requirements = account.requirements;
  if (!requirements) return [];
  const blockers = [
    ...new Set(requirements.errors?.map((error) => error.reason) ?? []),
  ];
  const outstanding = [
    ...new Set([
      ...(requirements.past_due ?? []),
      ...(requirements.currently_due ?? []),
    ]),
  ].filter(
    (field) =>
      !requirements.errors?.some((error) => error.requirement === field),
  );
  if (outstanding.length > 0) {
    blockers.push(
      `Stripe still needs: ${outstanding.map(describeRequirement).join(", ")}.`,
    );
  }
  if (requirements.pending_verification?.length) {
    blockers.push(
      "Stripe is verifying details it already has; this can take a few minutes.",
    );
  }
  return blockers;
}

function describeRequirement(field: string) {
  return field.replace(/[._]/g, " ");
}

export async function createConnectOnboardingLink(
  orgId: string,
  urls: { refreshUrl: string; returnUrl: string },
  store: BillingStore = prismaBillingStore,
) {
  const organization = await store.getOrganization(orgId);
  if (!organization) throw new Error("Organization not found");

  let accountId = organization.stripeAccountId;
  if (accountId) {
    // Accounts created before capabilities were requested explicitly only carry the
    // platform defaults; requesting again is idempotent and lets onboarding collect
    // whatever card payments still need.
    await stripe().accounts.update(accountId, {
      capabilities: CONNECT_CAPABILITIES,
    });
  } else {
    const account = await stripe().accounts.create({
      type: "express",
      business_profile: { name: organization.name },
      capabilities: CONNECT_CAPABILITIES,
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
  if (!organization?.stripeAccountId)
    throw new Error("Stripe onboarding has not started");
  const account = await stripe().accounts.retrieve(
    organization.stripeAccountId,
  );
  const status = { id: account.id, ...connectAccountStatus(account) };
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
    throw new Error(
      "This organization is not ready to accept sponsorship payments",
    );
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
            unit_amount: input.monthlyCents,
            recurring: { interval: "month" },
            product_data: { name: `Sponsorship with ${organization.name}` },
          },
          quantity: 1,
        },
      ],
      metadata: {
        orgId: input.orgId,
        residentId: input.residentId,
        sponsorName: input.sponsorName,
        sponsorEmail: input.sponsorEmail,
        monthlyCents: String(input.monthlyCents),
      },
      subscription_data: {
        metadata: {
          orgId: input.orgId,
          residentId: input.residentId,
          monthlyCents: String(input.monthlyCents),
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

type StripeSubscriptionOperation = {
  stripeAccountId: string | null | undefined;
  subscriptionId: string | null | undefined;
};

function hasStripeSubscription(
  input: StripeSubscriptionOperation,
): input is { stripeAccountId: string; subscriptionId: string } {
  if (input.stripeAccountId && input.subscriptionId) return true;
  console.info(
    "Skipping Stripe subscription cancel: subscription or connected account is missing",
  );
  return false;
}

export async function cancelStripeSubscription(
  input: StripeSubscriptionOperation,
) {
  if (!hasStripeSubscription(input)) return;

  return stripe().subscriptions.cancel(
    input.subscriptionId,
    {},
    { stripeAccount: input.stripeAccountId },
  );
}

function id(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
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
    await store.saveStripeAccountStatus(orgId, connectAccountStatus(account));
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const {
      orgId,
      residentId,
      sponsorName,
      sponsorEmail,
      monthlyCents: monthlyCentsValue,
    } = session.metadata ?? {};
    const subscriptionId = id(session.subscription);
    const monthlyCents = Number(monthlyCentsValue);
    if (
      !event.account ||
      !orgId ||
      !residentId ||
      !sponsorName ||
      !sponsorEmail ||
      !subscriptionId ||
      !Number.isSafeInteger(monthlyCents) ||
      monthlyCents <= 0
    ) {
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
      monthlyCents,
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
