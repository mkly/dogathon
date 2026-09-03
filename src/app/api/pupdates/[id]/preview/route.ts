import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { renderPupdateEmail } from "@/lib/pupdate-email";
import { companionPageUrl } from "@/lib/pupdate-delivery";

type RouteContext = { params: Promise<{ id: string }> };

/** Renders the sponsor email exactly as it will be sent, for staff to eyeball. */
export async function GET(request: Request, { params }: RouteContext) {
  const requestHeaders = new Headers(request.headers);
  const orgSlug = new URL(request.url).searchParams.get("org");
  if (orgSlug) requestHeaders.set("x-organization-slug", orgSlug);
  const access = await requireApiOrganization(requestHeaders, ["owner", "admin"]);
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  const { id } = await params;
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
