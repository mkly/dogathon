import { z } from "zod";

import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { renderPupdateEmail } from "@/lib/pupdate-email";
import { companionPageUrl } from "@/lib/pupdate-delivery";
import { uuidSchema } from "@/lib/uuid";

type RouteContext = { params: Promise<{ id: string }> };
const previewQuerySchema = z.object({ org: z.string().trim().min(1).optional() });

/** Renders the sponsor email exactly as it will be sent, for staff to eyeball. */
export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }

  const requestHeaders = new Headers(request.headers);
  const query = previewQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  const orgSlug = query.success ? query.data.org : undefined;
  if (orgSlug) requestHeaders.set("x-organization-slug", orgSlug);
  const access = await requireApiOrganization(requestHeaders, { pupdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const pupdate = await prisma.pupdate.findFirst({
    where: { id, orgId },
    include: {
      organization: { select: { slug: true } },
      resident: { select: { name: true, photoUrls: true } },
    },
  });

  if (!pupdate) {
    return Response.json({ error: "Pupdate not found" }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  const html = renderPupdateEmail({
    companionName: pupdate.resident.name,
    subject: pupdate.subject,
    bodyText: pupdate.bodyText,
    companionUrl: companionPageUrl(origin, pupdate.organization.slug, pupdate.residentId),
    origin,
    photoUrl: pupdate.photoUrl ?? pupdate.resident.photoUrls[0] ?? null,
    type: pupdate.type === "graduation" ? "graduation" : "regular",
  });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
