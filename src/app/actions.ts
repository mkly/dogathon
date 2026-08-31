"use server";

import { notFound, redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { createStripeCheckout, ResidentUnavailableError } from "@/lib/stripe-billing";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorship(formData: FormData) {
  const residentId = text(formData, "residentId");
  const orgSlug = text(formData, "orgSlug");
  const sponsorName = text(formData, "sponsorName");
  const sponsorEmail = text(formData, "sponsorEmail");

  // Without both segments the path collapses to "//dogs/..." — a scheme-relative
  // URL the browser would read as another host, so send those back to the index.
  if (!orgSlug || !residentId) {
    redirect("/");
  }

  const dogPath = `/${encodeURIComponent(orgSlug)}/dogs/${encodeURIComponent(residentId)}`;

  if (
    !sponsorName
    || sponsorName.length > 100
    || !sponsorEmail.includes("@")
    || sponsorEmail.length > 254
  ) {
    redirect(`${dogPath}?error=invalid`);
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
      successUrl: `${appUrl}${dogPath}?sponsored=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}${dogPath}?checkout=canceled`,
    });
    checkoutUrl = session.url;
  } catch (error) {
    if (error instanceof ResidentUnavailableError) {
      redirect(`${dogPath}?error=unavailable`);
    }
    console.error("Unable to create Stripe Checkout session", error);
    redirect(`${dogPath}?error=billing`);
  }
  redirect(checkoutUrl);
}
