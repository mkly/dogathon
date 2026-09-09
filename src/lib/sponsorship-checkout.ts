import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getPublicResidentBySource } from "@/lib/public-roster-cache";
import {
  checkRateLimit,
  getRateLimitIdentity,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { normalizeSourceUrl } from "@/lib/source-url";
import {
  createStripeCheckout,
  ResidentUnavailableError,
} from "@/lib/stripe-billing";
import { uuidSchema } from "@/lib/uuid";

const routeSchema = z.object({
  orgSlug: z.string().trim().min(1),
  target: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("resident-id"),
      value: z.string().trim().min(1),
    }),
    z.object({
      kind: z.literal("source"),
      value: z.string().trim().min(1).max(2048),
    }),
  ]),
});

const detailsSchema = z.object({
  sponsorName: z.string().trim().min(1).max(100),
  sponsorEmail: z.string().trim().email().max(254),
});

export type SponsorshipCheckoutErrorCode =
  "invalid" | "invalid-tier" | "rate-limited" | "unavailable" | "billing";

export type SponsorshipOrganization = {
  id: string;
  settings: { allowedOrigins: string[] } | null;
  sponsorshipTiers: Array<{
    id: string;
    monthlyCents: number;
    isDefault: boolean;
  }>;
};

type CheckoutDestination = {
  cancelUrl: string;
  errorUrl(code: SponsorshipCheckoutErrorCode): string;
  successUrl: string;
};

type CheckoutContext = {
  organization: SponsorshipOrganization;
  orgSlug: string;
};

export type SponsorshipCheckoutInput = {
  headers: Headers;
  orgSlug: unknown;
  sponsorEmail: unknown;
  sponsorName: unknown;
  target: unknown;
  tier?: unknown;
};

export type SponsorshipCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "invalid-route" }
  | { ok: false; reason: "not-found" }
  | {
      ok: false;
      code: SponsorshipCheckoutErrorCode;
      errorUrl?: string;
      orgSlug: string;
      reason: "checkout-error";
      residentId?: string;
      retryAfterSeconds?: number;
    };

export type SponsorshipCheckoutDependencies = {
  createCheckout(
    input: Parameters<typeof createStripeCheckout>[0],
  ): Promise<{ url: string | null }>;
  findOrganization(slug: string): Promise<SponsorshipOrganization | null>;
  findResidentBySource(
    orgId: string,
    sourceUrl: string,
  ): Promise<{ id: string } | null>;
  rateLimit(
    requestHeaders: Headers,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};

const defaultDependencies: SponsorshipCheckoutDependencies = {
  createCheckout: createStripeCheckout,
  findOrganization(slug) {
    return prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        settings: { select: { allowedOrigins: true } },
        sponsorshipTiers: {
          orderBy: { position: "asc" },
          select: { id: true, monthlyCents: true, isDefault: true },
        },
      },
    });
  },
  findResidentBySource: getPublicResidentBySource,
  async rateLimit(requestHeaders) {
    return checkRateLimit({
      ...RATE_LIMITS.sponsorshipCheckout,
      identity: await getRateLimitIdentity(requestHeaders),
      scope: "sponsorship-checkout",
    });
  },
};

function checkoutError(
  code: SponsorshipCheckoutErrorCode,
  context: {
    destination?: CheckoutDestination;
    orgSlug: string;
    residentId?: string;
    retryAfterSeconds?: number;
  },
): SponsorshipCheckoutResult {
  return {
    ok: false,
    reason: "checkout-error",
    code,
    errorUrl: context.destination?.errorUrl(code),
    orgSlug: context.orgSlug,
    residentId: context.residentId,
    retryAfterSeconds: context.retryAfterSeconds,
  };
}

export async function startSponsorshipCheckout(
  input: SponsorshipCheckoutInput,
  buildDestination: (context: CheckoutContext) => CheckoutDestination | null,
  options: {
    dependencies?: SponsorshipCheckoutDependencies;
    organization?: SponsorshipOrganization;
  } = {},
): Promise<SponsorshipCheckoutResult> {
  const dependencies = options.dependencies ?? defaultDependencies;
  const route = routeSchema.safeParse({
    orgSlug: input.orgSlug,
    target: input.target,
  });
  if (!route.success) return { ok: false, reason: "invalid-route" };

  const { orgSlug, target } = route.data;
  if (
    target.kind === "resident-id" &&
    !uuidSchema.safeParse(target.value).success
  ) {
    return { ok: false, reason: "not-found" };
  }

  const details = detailsSchema.safeParse(input);
  if (!details.success) {
    return checkoutError("invalid", {
      orgSlug,
      residentId: target.kind === "resident-id" ? target.value : undefined,
    });
  }

  const organization =
    options.organization ?? (await dependencies.findOrganization(orgSlug));
  if (!organization) return { ok: false, reason: "not-found" };

  const destination = buildDestination({ organization, orgSlug });
  if (!destination) {
    return checkoutError("invalid", {
      orgSlug,
      residentId: target.kind === "resident-id" ? target.value : undefined,
    });
  }

  // An organization that has never saved its sponsorship settings has no tiers, and every
  // other price read falls back to the default, so an unspecified tier does too.
  const monthlyCents =
    input.tier === undefined
      ? (organization.sponsorshipTiers.find((tier) => tier.isDefault)
          ?.monthlyCents ??
        organization.sponsorshipTiers[0]?.monthlyCents ??
        DEFAULT_SPONSORSHIP_MONTHLY_CENTS)
      : typeof input.tier === "string"
        ? organization.sponsorshipTiers.find(({ id }) => id === input.tier)
            ?.monthlyCents
        : undefined;
  if (monthlyCents === undefined) {
    return checkoutError("invalid-tier", {
      destination,
      orgSlug,
      residentId: target.kind === "resident-id" ? target.value : undefined,
    });
  }

  const rateLimit = await dependencies.rateLimit(input.headers);
  if (!rateLimit.allowed) {
    return checkoutError("rate-limited", {
      destination,
      orgSlug,
      residentId: target.kind === "resident-id" ? target.value : undefined,
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  let residentId: string;
  if (target.kind === "resident-id") {
    residentId = target.value;
  } else {
    const sourceUrl = normalizeSourceUrl(target.value);
    if (!sourceUrl) return checkoutError("invalid", { destination, orgSlug });
    const resident = await dependencies.findResidentBySource(
      organization.id,
      sourceUrl,
    );
    if (!resident)
      return checkoutError("unavailable", { destination, orgSlug });
    residentId = resident.id;
  }

  try {
    const session = await dependencies.createCheckout({
      orgId: organization.id,
      monthlyCents,
      residentId,
      sponsorName: details.data.sponsorName,
      sponsorEmail: details.data.sponsorEmail,
      successUrl: destination.successUrl,
      cancelUrl: destination.cancelUrl,
    });
    if (!session.url)
      return checkoutError("billing", { destination, orgSlug, residentId });
    return { ok: true, url: session.url };
  } catch (error) {
    if (error instanceof ResidentUnavailableError) {
      return checkoutError("unavailable", { destination, orgSlug, residentId });
    }
    console.error("Unable to create Stripe Checkout session", error);
    return checkoutError("billing", { destination, orgSlug, residentId });
  }
}
