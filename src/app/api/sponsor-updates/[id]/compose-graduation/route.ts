import { enqueueGraduationComposition } from "@/lib/email-composition-service";
import { requireApiOrganization } from "@/lib/organization-access";
import { uuidSchema } from "@/lib/uuid";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success)
    return Response.json(
      { error: "Graduation draft not found" },
      { status: 404 },
    );
  const access = await requireApiOrganization(request.headers, {
    sponsorUpdate: ["manage"],
  });
  if (!access.ok) return access.response;
  const result = await enqueueGraduationComposition({
    updateId: id,
    orgId: access.context.orgId,
    requestedByUserId: access.context.userId,
  });
  if (result === "not-found")
    return Response.json(
      { error: "Graduation draft not found" },
      { status: 404 },
    );
  if (result === "not-adopted")
    return Response.json(
      { error: "Only adoption notices can weave in recent chats." },
      { status: 409 },
    );
  if (result === "no-pending-chats")
    return Response.json(
      { error: "There are no pending chats to weave in." },
      { status: 409 },
    );
  return Response.json({ job: result }, { status: 202 });
}
