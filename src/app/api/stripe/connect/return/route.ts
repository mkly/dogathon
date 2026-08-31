import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getOrganizationContext } from "@/lib/organization-access";
import { refreshConnectStatus } from "@/lib/stripe-billing";

export async function GET() {
  const context = await getOrganizationContext(await headers(), ["owner"]);
  if (!context) redirect("/organizations");

  await refreshConnectStatus(context.orgId);
  redirect("/admin");
}
