"use server";

import { redirect } from "next/navigation";

import { createStripeCheckout, ResidentUnavailableError } from "@/lib/stripe-billing";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createSponsorship(formData: FormData) {
  const residentId = text(formData, "residentId");
  const orgId = text(formData, "orgId");
  const sponsorName = text(formData, "sponsorName");
  const sponsorEmail = text(formData, "sponsorEmail");
  const dogPath = `/dogs/${encodeURIComponent(residentId)}`;

  if (
    !residentId
    || !orgId
    || !sponsorName
    || sponsorName.length > 100
    || !sponsorEmail.includes("@")
    || sponsorEmail.length > 254
  ) {
    redirect(`${dogPath}?error=invalid`);
  }

  const appUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  let checkoutUrl: string;
  try {
    const session = await createStripeCheckout({
      orgId,
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
