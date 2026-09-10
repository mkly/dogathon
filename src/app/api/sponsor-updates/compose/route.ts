import { z } from "zod";

import { enqueueRegularComposition } from "@/lib/email-composition-service";
import { requireApiOrganization } from "@/lib/organization-access";
import { uuidSchema } from "@/lib/uuid";

const composeRequestSchema = z.object({ residentId: uuidSchema });

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, {
    sponsorUpdate: ["manage"],
  });
  if (!access.ok) return access.response;
  const input = composeRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return Response.json(
      { error: "residentId must be a UUID" },
      { status: 400 },
    );
  const result = await enqueueRegularComposition({
    orgId: access.context.orgId,
    requestedByUserId: access.context.userId,
    residentId: input.data.residentId,
  });
  if (result === "not-found")
    return Response.json({ error: "Resident not found" }, { status: 404 });
  if (result === "not-available")
    return Response.json(
      { error: "Regular updates can only be drafted for available companions" },
      { status: 409 },
    );
  if (result === "no-pending-chats")
    return Response.json(
      { error: "There are no pending chats to compose." },
      { status: 409 },
    );
  return Response.json({ job: result }, { status: 202 });
}
