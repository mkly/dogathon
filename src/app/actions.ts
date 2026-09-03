"use server";

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createStripeCheckout, ResidentUnavailableError } from "@/lib/stripe-billing";
import { isUuid } from "@/lib/uuid";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorship(formData: FormData) {
  const residentId = text(formData, "residentId");
  const orgSlug = text(formData, "orgSlug");
  const sponsorName = text(formData, "sponsorName");
  const sponsorEmail = text(formData, "sponsorEmail");

  // Without both segments the path collapses to "//companions/..." — a scheme-relative
  // URL the browser would read as another host, so send those back to the index.
  if (!orgSlug || !residentId) {
    redirect("/");
  }
  if (!isUuid(residentId)) notFound();

  const companionPath = `/${encodeURIComponent(orgSlug)}/companions/${encodeURIComponent(residentId)}`;

  if (
    !sponsorName
    || sponsorName.length > 100
    || !sponsorEmail.includes("@")
    || sponsorEmail.length > 254
  ) {
    redirect(`${companionPath}?error=invalid`);
  }

  const organization = await prisma.organization.findUnique({
    where: { slug: orgSlug },
    select: { id: true },
  });
  if (!organization) notFound();

  const appUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  let checkoutUrl: string;
  try {
    const session = await createStripeCheckout({
      orgId: organization.id,
      residentId,
      sponsorName,
      sponsorEmail,
      successUrl: `${appUrl}${companionPath}?sponsored=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}${companionPath}?checkout=canceled`,
    });
    checkoutUrl = session.url;
  } catch (error) {
    if (error instanceof ResidentUnavailableError) {
      redirect(`${companionPath}?error=unavailable`);
    }
    console.error("Unable to create Stripe Checkout session", error);
    redirect(`${companionPath}?error=billing`);
  }
  redirect(checkoutUrl);
}
