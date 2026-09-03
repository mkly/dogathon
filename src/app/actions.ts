"use server";

import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { createStripeCheckout, ResidentUnavailableError } from "@/lib/stripe-billing";
import { uuidSchema } from "@/lib/uuid";

const sponsorshipRouteSchema = z.object({
  residentId: z.string().trim().min(1),
  orgSlug: z.string().trim().min(1),
});
const sponsorshipDetailsSchema = z.object({
  sponsorName: z.string().trim().min(1).max(100),
  sponsorEmail: z.string().trim().email().max(254),
});

export async function createSponsorship(formData: FormData) {
  const input = Object.fromEntries(formData);
  const route = sponsorshipRouteSchema.safeParse(input);

  // Without both segments the path collapses to "//companions/..." — a scheme-relative
  // URL the browser would read as another host, so send those back to the index.
  if (!route.success) {
    redirect("/");
  }
  const { orgSlug, residentId } = route.data;
  if (!uuidSchema.safeParse(residentId).success) notFound();

  const companionPath = `/${encodeURIComponent(orgSlug)}/companions/${encodeURIComponent(residentId)}`;

  const details = sponsorshipDetailsSchema.safeParse(input);
  if (!details.success) {
    redirect(`${companionPath}?error=invalid`);
  }
  const { sponsorName, sponsorEmail } = details.data;

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
