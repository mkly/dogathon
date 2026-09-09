import { composeGraduationDraft } from "@/lib/graduation-draft-composer";
import { requireApiOrganization } from "@/lib/organization-access";
import { uuidSchema } from "@/lib/uuid";

export const maxDuration = 800;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) {
    return Response.json(
      { error: "Graduation draft not found" },
      { status: 404 },
    );
  }

  const access = await requireApiOrganization(request.headers, {
    sponsorUpdate: ["manage"],
  });
  if (!access.ok) return access.response;
  let result: Awaited<ReturnType<typeof composeGraduationDraft>>;
  try {
    result = await composeGraduationDraft(id, access.context.orgId);
  } catch (error) {
    console.error("Graduation update composition failed", {
      id,
      orgId: access.context.orgId,
      error,
    });
    return Response.json(
      { error: "Drafting the graduation story failed. Please try again." },
      { status: 502 },
    );
  }

  if (result === "not-found") {
    return Response.json(
      { error: "Graduation draft not found" },
      { status: 404 },
    );
  }
  if (result === "not-adopted") {
    return Response.json(
      { error: "Only adoption notices can weave in recent chats." },
      { status: 409 },
    );
  }
  if (result === "no-pending-chats") {
    return Response.json(
      { error: "There are no pending chats to weave in." },
      { status: 409 },
    );
  }
  if (result === "conflict") {
    return Response.json(
      { error: "Those chats were already used in another update." },
      { status: 409 },
    );
  }
  return Response.json({ id });
}
