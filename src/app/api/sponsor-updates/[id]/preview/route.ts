import { z } from "zod";

import { SponsorUpdateEmail } from "@/emails/sponsor-update-email";
import { env } from "@/lib/env";
import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SPONSORSHIP_MONTHLY_CENTS } from "@/lib/rescue-settings";
import { companionPageUrl, isRegularSponsorUpdateRecipient } from "@/lib/sponsor-update-delivery";
import { sponsorshipSelectionUrl } from "@/lib/sponsorship-selection-token";
import { uuidSchema } from "@/lib/uuid";
import { render } from "@react-email/render";
import { createElement } from "react";

type RouteContext = { params: Promise<{ id: string }> };
const previewQuerySchema = z.object({ org: z.string().trim().min(1).optional() });

/** Renders the sponsor email exactly as it will be sent, for staff to eyeball. */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const requestHeaders = new Headers(request.headers);
  const query = previewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const orgSlug = query.success ? query.data.org : undefined;
  if (orgSlug) requestHeaders.set("x-organization-slug", orgSlug);
  const access = await requireApiOrganization(requestHeaders, { sponsorUpdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const sponsorUpdate = await prisma.sponsorUpdate.findFirst({
    where: { id, orgId },
    include: {
      organization: {
        select: {
          slug: true,
        },
      },
      sponsorship: {
        select: { monthlyCents: true },
      },
      resident: {
        select: {
          name: true,
          available: true,
          photoUrls: true,
          sponsorships: {
            orderBy: { createdAt: "asc" },
            select: { monthlyCents: true, status: true, endedReason: true },
          },
        },
      },
    },
  });

  if (!sponsorUpdate) {
    return Response.json({ error: "Update not found" }, { status: 404 });
  }

  const origin = env.BETTER_AUTH_URL;
  const actionUrl = sponsorUpdate.type === "graduation"
    && sponsorUpdate.sponsorshipId
    && env.BETTER_AUTH_SECRET
    ? sponsorshipSelectionUrl(
      origin,
      sponsorUpdate.organization.slug,
      sponsorUpdate.sponsorshipId,
      env.BETTER_AUTH_SECRET,
    )
    : companionPageUrl(origin, sponsorUpdate.organization.slug, sponsorUpdate.residentId);
  const html = await render(createElement(SponsorUpdateEmail, {
    companionName: sponsorUpdate.resident.name,
    subject: sponsorUpdate.subject,
    bodyText: sponsorUpdate.bodyText,
    actionUrl,
    monthlyCents: sponsorUpdate.sponsorship?.monthlyCents
      ?? sponsorUpdate.resident.sponsorships.find((sponsorship) =>
        isRegularSponsorUpdateRecipient(sponsorship, sponsorUpdate.resident.available))?.monthlyCents
      ?? DEFAULT_SPONSORSHIP_MONTHLY_CENTS,
    origin,
    photoUrl: sponsorUpdate.heroPhotoUrl ?? sponsorUpdate.resident.photoUrls[0] ?? null,
    type: sponsorUpdate.type === "graduation" ? "graduation" : "regular",
  }));

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
