"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getSponsorContext } from "@/lib/sponsor-access";
import { stripeGateway } from "@/lib/stripe-billing";
import { isUuid } from "@/lib/uuid";

const SPONSORSHIP_CHANNELS = ["email", "sms", "both"] as const;

export async function updateSponsorProfile(formData: FormData) {
  const sponsor = await getSponsorContext(await headers());
  if (!sponsor) redirect("/account/sign-in");

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const channel = String(formData.get("channel") ?? "");

  if (!name) throw new Error("Name is required");
  if (!SPONSORSHIP_CHANNELS.includes(channel as (typeof SPONSORSHIP_CHANNELS)[number])) {
    throw new Error("Choose a valid update channel");
  }

  await prisma.sponsor.update({
    where: { id: sponsor.id },
    data: {
      name,
      phone: phone || null,
      channel: channel as (typeof SPONSORSHIP_CHANNELS)[number],
    },
  });

  revalidatePath("/account");
}

export async function openBillingPortal(sponsorshipId: string) {
  const sponsor = await getSponsorContext(await headers());
  if (!sponsor) redirect("/account/sign-in");
  if (!isUuid(sponsorshipId)) {
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
  const portal = await stripeGateway().createBillingPortalSession({
    accountId,
    customerId,
    returnUrl: new URL("/account", baseUrl).toString(),
  });

  redirect(portal.url);
}
