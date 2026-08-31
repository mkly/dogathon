import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOrganizationContext } from "@/lib/organization-access";
import { createConnectOnboardingLink } from "@/lib/stripe-billing";

export async function GET() {
  const context = await getOrganizationContext(await headers(), ["owner"]);
  if (!context) redirect("/organizations");

  const appUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const link = await createConnectOnboardingLink(context.orgId, {
    refreshUrl: `${appUrl}/api/stripe/connect/refresh`,
    returnUrl: `${appUrl}/api/stripe/connect/return`,
  });
  redirect(link.url);
}
