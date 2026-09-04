"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSponsorContext } from "@/lib/sponsor-access";
import { createBillingPortalSession } from "@/lib/stripe-billing";
import { env } from "@/lib/env";
import { uuidSchema } from "@/lib/uuid";

const SPONSORSHIP_CHANNELS = ["email", "sms", "both"] as const;
const sponsorProfileSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim(),
  channel: z.enum(SPONSORSHIP_CHANNELS),
});

export type AccountActionState = { error?: string; success?: boolean };

export async function updateSponsorProfile(
  _previousState: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const sponsor = await getSponsorContext(await headers());
  if (!sponsor) redirect("/account/sign-in");

  const profile = sponsorProfileSchema.safeParse(Object.fromEntries(formData));
  if (!profile.success && profile.error.issues.some((issue) => issue.path[0] === "name")) {
    return { error: "Name is required" };
  }
  if (!profile.success) {
    return { error: "Choose a valid update channel" };
  }
  const { name, phone, channel } = profile.data;

  await prisma.sponsor.update({
    where: { id: sponsor.id },
    data: {
      name,
      phone: phone || null,
      channel,
    },
  });

  revalidatePath("/account");
  return { success: true };
}

export async function openBillingPortal(
  sponsorshipId: string,
  _previousState: AccountActionState,
): Promise<AccountActionState> {
  const sponsor = await getSponsorContext(await headers());
  if (!sponsor) redirect("/account/sign-in");
  if (!uuidSchema.safeParse(sponsorshipId).success) {
    return { error: "Billing management is unavailable for this sponsorship" };
  }

  const sponsorship = await prisma.sponsorship.findFirst({
    where: {
      id: sponsorshipId,
      sponsorId: sponsor.id,
      status: "active",
    },
    select: {
      stripeCustomerId: true,
      organization: { select: { stripeAccountId: true } },
    },
  });

  const customerId = sponsorship?.stripeCustomerId;
  const accountId = sponsorship?.organization.stripeAccountId;
  if (!customerId || !accountId) {
    return { error: "Billing management is unavailable for this sponsorship" };
  }

  const portal = await createBillingPortalSession({
    accountId,
    customerId,
    returnUrl: new URL("/account", env.BETTER_AUTH_URL).toString(),
  });

  redirect(portal.url);
}
