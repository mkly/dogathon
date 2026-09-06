import { z } from "zod";

import { composeSponsorUpdate } from "@/lib/composer";
import { requireApiOrganization } from "@/lib/organization-access";
import { companionPageUrl } from "@/lib/sponsor-update-delivery";
import { prisma } from "@/lib/prisma";
import { uuidSchema } from "@/lib/uuid";

const composeRequestSchema = z.object({
  residentId: uuidSchema,
  type: z.enum(["regular", "graduation"]).optional(),
});

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, { sponsorUpdate: ["manage"] });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }
  const input = composeRequestSchema.safeParse(body);
  if (!input.success && input.error.issues.some((issue) => issue.path[0] === "residentId")) {
    return Response.json({ error: "residentId must be a UUID" }, { status: 400 });
  }
  if (!input.success) {
    return Response.json({ error: "type must be regular or graduation" }, { status: 400 });
  }

  const resident = await prisma.resident.findFirst({
    where: { id: input.data.residentId, orgId },
    include: {
      organization: { select: { slug: true } },
      volunteerNotes: {
        orderBy: { createdAt: "desc" },
        take: 10,
        // never pull photoData bytes into the compose payload
        select: { note: true, photoUrl: true, createdAt: true },
      },
    },
  });
  if (!resident) {
    return Response.json({ error: "Resident not found" }, { status: 404 });
  }

  const settings = await prisma.rescueSettings.findUnique({ where: { orgId } });
  const type = input.data.type ?? "regular";
  let composed;
  try {
    composed = await composeSponsorUpdate({
      companion: {
        name: resident.name,
        breed: resident.breed,
        sex: resident.sex,
        ageText: resident.ageText,
      },
      notes: resident.volunteerNotes,
      pinnedPostscript: settings?.pinnedPostscript ?? "",
      type,
      companionPageUrl: companionPageUrl(request.url, resident.organization.slug, resident.id),
    });
  } catch (error) {
    console.error("Update composition failed", error);
    return Response.json({ error: "Drafting the update failed. Please try again." }, { status: 502 });
  }
  const sponsorUpdate = await prisma.sponsorUpdate.create({
    data: {
      orgId,
      residentId: resident.id,
      type,
      // pin the picture from the notes this draft was written from: the roster
      // profile shot is the companion, but the update is about the day
      photoUrl: resident.volunteerNotes.find((note) => note.photoUrl)?.photoUrl ?? null,
      // Kept only until the sibling delivery task removes the legacy column.
      smsText: "",
      ...composed,
    },
  });

  return Response.json({ sponsorUpdate }, { status: 201 });
}
