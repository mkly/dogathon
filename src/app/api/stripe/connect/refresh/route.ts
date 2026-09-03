import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { createConnectOnboardingLink } from "@/lib/stripe-billing";

export async function GET(request: Request) {
  const orgSlug = new URL(request.url).searchParams.get("org") ?? "";
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    billing: ["manage"],
  });
  if (!access?.context) redirect("/staff/organizations");

  const appUrl = process.env.BETTER_AUTH_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const org = `?org=${encodeURIComponent(access.organization.slug)}`;
  const link = await createConnectOnboardingLink(access.context.orgId, {
    refreshUrl: `${appUrl}/api/stripe/connect/refresh${org}`,
    returnUrl: `${appUrl}/api/stripe/connect/return${org}`,
  });
  redirect(link.url);
}
