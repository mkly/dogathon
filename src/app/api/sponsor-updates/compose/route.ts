import { z } from "zod";

import { composeSponsorUpdate } from "@/lib/composer";
import { env } from "@/lib/env";
import { requireApiOrganization } from "@/lib/organization-access";
import { companionPageUrl } from "@/lib/sponsor-update-delivery";
import { prisma } from "@/lib/prisma";
import { messageText } from "@/lib/ui-message-text";
import { uuidSchema } from "@/lib/uuid";
import { interviewTranscriptSchema } from "@/lib/volunteer-interview-request";

const composeRequestSchema = z.object({
  residentId: uuidSchema,
  type: z.enum(["regular", "graduation"]).optional(),
});

function conversationLines(transcript: unknown): string[] | undefined {
  const parsed = interviewTranscriptSchema.safeParse(transcript);
  if (!parsed.success) return undefined;
  const lines = parsed.data
    .map((message) => ({ role: message.role, text: messageText(message).replace("[[READY]]", "").trim() }))
    .filter(({ text }) => text)
    .map(({ role, text }) => `${role === "user" ? "Volunteer" : "Interviewer"}: ${text}`);
  return lines.length > 0 ? lines : undefined;
}

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

  const [resident, settings] = await Promise.all([
    prisma.resident.findFirst({
      where: { id: input.data.residentId, orgId },
      include: {
        organization: { select: { slug: true } },
        checkIns: {
          where: { status: "completed", sponsorUpdateId: null },
          orderBy: { updatedAt: "desc" },
          take: 10,
          select: {
            transcript: true,
            photos: {
              orderBy: { createdAt: "desc" },
              select: { url: true, webUrl: true },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.rescueSettings.findUnique({ where: { orgId } }),
  ]);
  if (!resident) {
    return Response.json({ error: "Resident not found" }, { status: 404 });
  }

  const type = input.data.type ?? "regular";
  if (type === "regular" && !resident.available) {
    return Response.json(
      { error: "Regular updates can only be drafted for available companions" },
      { status: 409 },
    );
  }
  let composed;
  try {
    composed = await composeSponsorUpdate({
      companion: {
        name: resident.name,
        available: resident.available,
        breed: resident.breed,
        sex: resident.sex,
        ageText: resident.ageText,
      },
      notes: resident.checkIns.map((checkIn) => {
        const conversation = conversationLines(checkIn.transcript) ?? [];
        return { note: conversation.join("\n"), conversation };
      }),
      pinnedPostscript: settings?.pinnedPostscript ?? "",
      type,
      companionPageUrl: companionPageUrl(env.BETTER_AUTH_URL, resident.organization.slug, resident.id),
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
      heroPhotoUrl: resident.checkIns
        .flatMap((checkIn) => checkIn.photos)
        .map((photo) => photo.webUrl ?? photo.url)[0] ?? null,
      ...composed,
    },
  });

  return Response.json({ sponsorUpdate }, { status: 201 });
}
