import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { refreshConnectStatus } from "@/lib/stripe-billing";

export async function GET(request: Request) {
  const orgSlug = new URL(request.url).searchParams.get("org") ?? "";
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, ["owner"]);
  if (!access?.context) redirect("/organizations");

  await refreshConnectStatus(access.context.orgId);
  redirect(`/${encodeURIComponent(access.organization.slug)}/admin/settings`);
}
