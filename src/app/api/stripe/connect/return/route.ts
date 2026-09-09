import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { refreshConnectStatus } from "@/lib/stripe-billing";

const connectQuerySchema = z.object({ org: z.string().trim().min(1) });

export async function GET(request: Request) {
  const query = connectQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  const orgSlug = query.success ? query.data.org : "";
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    billing: ["manage"],
  });
  if (!access?.context) redirect("/staff/organizations");

  await refreshConnectStatus(access.context.orgId);
  redirect(`/${encodeURIComponent(access.organization.slug)}/admin/settings`);
}
