import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getPublicResidentBySource } from "@/lib/public-roster-cache";
import { checkRateLimit, getRateLimitIdentity, RATE_LIMITS } from "@/lib/rate-limit";
import { normalizeSourceUrl } from "@/lib/source-url";
import { createStripeCheckout, ResidentUnavailableError } from "@/lib/stripe-billing";
import { uuidSchema } from "@/lib/uuid";

const routeSchema = z.object({
  orgSlug: z.string().trim().min(1),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("resident-id"), value: z.string().trim().min(1) }),
    z.object({ kind: z.literal("source"), value: z.string().trim().min(1).max(2048) }),
  ]),
});

const detailsSchema = z.object({
  sponsorName: z.string().trim().min(1).max(100),
  sponsorEmail: z.string().trim().email().max(254),
});

export type SponsorshipCheckoutErrorCode = "invalid" | "rate-limited" | "unavailable" | "billing";

export type SponsorshipOrganization = {
  id: string;
  settings: { allowedOrigins: string[] } | null;
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
  createCheckout(input: Parameters<typeof createStripeCheckout>[0]): Promise<{ url: string | null }>;
  findOrganization(slug: string): Promise<SponsorshipOrganization | null>;
  findResidentBySource(orgId: string, sourceUrl: string): Promise<{ id: string } | null>;
  rateLimit(requestHeaders: Headers): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
};

const defaultDependencies: SponsorshipCheckoutDependencies = {
  createCheckout: createStripeCheckout,
  findOrganization(slug) {
    return prisma.organization.findUnique({
      where: { slug },
      select: { id: true, settings: { select: { allowedOrigins: true } } },
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

export function findSponsorshipOrganization(
  slug: string,
  dependencies: SponsorshipCheckoutDependencies = defaultDependencies,
) {
  return dependencies.findOrganization(slug);
}

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

function normalizedSource(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
  } catch {
    return "";
  }
  return normalizeSourceUrl(value);
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
  const route = routeSchema.safeParse({ orgSlug: input.orgSlug, target: input.target });
  if (!route.success) return { ok: false, reason: "invalid-route" };

  const { orgSlug, target } = route.data;
  if (target.kind === "resident-id" && !uuidSchema.safeParse(target.value).success) {
    return { ok: false, reason: "not-found" };
  }

  const details = detailsSchema.safeParse(input);
  if (!details.success) {
    return checkoutError("invalid", {
      orgSlug,
      residentId: target.kind === "resident-id" ? target.value : undefined,
    });
  }

  const organization = options.organization ?? await dependencies.findOrganization(orgSlug);
  if (!organization) return { ok: false, reason: "not-found" };

  const destination = buildDestination({ organization, orgSlug });
  if (!destination) {
    return checkoutError("invalid", {
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
    const sourceUrl = normalizedSource(target.value);
    if (!sourceUrl) return checkoutError("invalid", { destination, orgSlug });
    const resident = await dependencies.findResidentBySource(organization.id, sourceUrl);
    if (!resident) return checkoutError("unavailable", { destination, orgSlug });
    residentId = resident.id;
  }

  try {
    const session = await dependencies.createCheckout({
      orgId: organization.id,
      residentId,
      sponsorName: details.data.sponsorName,
      sponsorEmail: details.data.sponsorEmail,
      successUrl: destination.successUrl,
      cancelUrl: destination.cancelUrl,
    });
    if (!session.url) return checkoutError("billing", { destination, orgSlug, residentId });
    return { ok: true, url: session.url };
  } catch (error) {
    if (error instanceof ResidentUnavailableError) {
      return checkoutError("unavailable", { destination, orgSlug, residentId });
    }
    console.error("Unable to create Stripe Checkout session", error);
    return checkoutError("billing", { destination, orgSlug, residentId });
  }
}
