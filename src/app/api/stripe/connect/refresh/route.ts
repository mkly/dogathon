import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { createConnectOnboardingLink } from "@/lib/stripe-billing";
import { env } from "@/lib/env";

const connectQuerySchema = z.object({ org: z.string().trim().min(1) });

export async function GET(request: Request) {
  const query = connectQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const orgSlug = query.success ? query.data.org : "";
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    billing: ["manage"],
  });
  if (!access?.context) redirect("/staff/organizations");

  const org = `?org=${encodeURIComponent(access.organization.slug)}`;
  const link = await createConnectOnboardingLink(access.context.orgId, {
    refreshUrl: `${env.BETTER_AUTH_URL}/api/stripe/connect/refresh${org}`,
    returnUrl: `${env.BETTER_AUTH_URL}/api/stripe/connect/return${org}`,
  });
  redirect(link.url);
}
