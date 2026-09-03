"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSponsorContext } from "@/lib/sponsor-access";
import { createBillingPortalSession } from "@/lib/stripe-billing";
import { uuidSchema } from "@/lib/uuid";

const SPONSORSHIP_CHANNELS = ["email", "sms", "both"] as const;
const sponsorProfileSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().trim(),
  channel: z.enum(SPONSORSHIP_CHANNELS),
});

export async function updateSponsorProfile(formData: FormData) {
  const sponsor = await getSponsorContext(await headers());
  if (!sponsor) redirect("/account/sign-in");

  const profile = sponsorProfileSchema.safeParse(Object.fromEntries(formData));
  if (!profile.success && profile.error.issues.some((issue) => issue.path[0] === "name")) {
    throw new Error("Name is required");
  }
  if (!profile.success) {
    throw new Error("Choose a valid update channel");
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
}

export async function openBillingPortal(sponsorshipId: string) {
  const sponsor = await getSponsorContext(await headers());
  if (!sponsor) redirect("/account/sign-in");
  if (!uuidSchema.safeParse(sponsorshipId).success) {
    throw new Error("Billing management is unavailable for this sponsorship");
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
    throw new Error("Billing management is unavailable for this sponsorship");
  }

  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const portal = await createBillingPortalSession({
    accountId,
    customerId,
    returnUrl: new URL("/account", baseUrl).toString(),
  });

  redirect(portal.url);
}
