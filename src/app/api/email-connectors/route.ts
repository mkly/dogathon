import { requireApiOrganization } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request) {
  const access = await requireApiOrganization(request.headers, {
    settings: ["manage"],
  });
  if (!access.ok) return access.response;

  await prisma.emailConnector.deleteMany({
    where: { orgId: access.context.orgId },
  });
  return new Response(null, { status: 204 });
}
