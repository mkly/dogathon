"use server";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { env } from "@/lib/env";
import { startSponsorshipCheckout } from "@/lib/sponsorship-checkout";

export async function createSponsorship(formData: FormData) {
  const input = Object.fromEntries(formData);
  const checkoutInput = {
    headers: await headers(),
    orgSlug: input.orgSlug,
    sponsorEmail: input.sponsorEmail,
    sponsorName: input.sponsorName,
    target: { kind: "resident-id" as const, value: input.residentId },
    tier: input.tier,
  };
  const result = await startSponsorshipCheckout(checkoutInput, ({ orgSlug }) => {
    const residentId = String(input.residentId);
    const companionPath = `/${encodeURIComponent(orgSlug)}/companions/${encodeURIComponent(residentId)}`;
    return {
      cancelUrl: `${env.BETTER_AUTH_URL}${companionPath}?checkout=canceled`,
      errorUrl: (code) => `${companionPath}?error=${code}`,
      successUrl: `${env.BETTER_AUTH_URL}${companionPath}?sponsored=1&session_id={CHECKOUT_SESSION_ID}`,
    };
  });

  if (!result.ok) {
    // Without both segments the path collapses to "//companions/..." — a scheme-relative
    // URL the browser would read as another host, so send those back to the index.
    if (result.reason === "invalid-route") redirect("/");
    if (result.reason === "not-found") notFound();
    const companionPath = `/${encodeURIComponent(result.orgSlug)}/companions/${encodeURIComponent(result.residentId ?? "")}`;
    redirect(result.errorUrl ?? `${companionPath}?error=${result.code}`);
  }
  redirect(result.url);
}
