import "server-only";

import { composeSponsorUpdate } from "./composer.ts";
import { env } from "./env.ts";
import { messageText } from "./ui-message-text.ts";
import { companionPageUrl } from "./sponsor-update-delivery.ts";
import { prisma } from "./prisma.ts";
import { interviewTranscriptSchema } from "./volunteer-interview-request.ts";

export type GraduationCompositionResult =
  | "composed"
  | "no-pending-chats"
  | "not-adopted"
  | "not-found"
  | "conflict";

function conversationLines(transcript: unknown): string[] | undefined {
  const parsed = interviewTranscriptSchema.safeParse(transcript);
  if (!parsed.success) return undefined;
  const lines = parsed.data
    .map((message) => ({
      role: message.role,
      text: messageText(message).replace("[[READY]]", "").trim(),
    }))
    .filter(({ text }) => text)
    .map(({ role, text }) => `${role === "user" ? "Volunteer" : "Interviewer"}: ${text}`);
  return lines.length > 0 ? lines : undefined;
}

export async function composeGraduationDraft(
  id: string,
  orgId: string,
): Promise<GraduationCompositionResult> {
  const [draft, settings] = await Promise.all([
    prisma.sponsorUpdate.findFirst({
      where: { id, orgId, status: "draft", type: "graduation" },
      include: {
        organization: { select: { slug: true } },
        resident: {
          include: {
            checkIns: {
              where: { status: "completed", sponsorUpdateId: null },
              orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
              select: {
                id: true,
                updatedAt: true,
                transcript: true,
                photos: {
                  orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                  select: { id: true, url: true, webUrl: true, createdAt: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.rescueSettings.findUnique({ where: { orgId } }),
  ]);
  if (!draft) return "not-found";
  // Unavailability notices share the graduation type but are not adoption
  // stories, so the adoption-story composer must never rewrite them.
  if (draft.resident.unavailabilityReason !== "adopted") return "not-adopted";
  if (draft.resident.checkIns.length === 0) return "no-pending-chats";

  const photos = draft.resident.checkIns.flatMap((checkIn) => checkIn.photos).map((photo) => ({
    id: photo.id,
    url: photo.webUrl ?? photo.url,
    takenAt: photo.createdAt,
  }));
  const sponsorshipPostscript = [
    "Your monthly sponsorship continues month to month.",
    "You can switch companions or cancel at any time from your sponsorship page.",
    settings?.pinnedPostscript,
  ].filter(Boolean).join("\n\n");
  const composed = await composeSponsorUpdate({
    companion: {
      name: draft.resident.name,
      available: draft.resident.available,
      breed: draft.resident.breed,
      sex: draft.resident.sex,
      ageText: draft.resident.ageText,
      personality: draft.resident.personality,
    },
    chats: draft.resident.checkIns.map((checkIn) => ({
      completedAt: checkIn.updatedAt,
      transcript: conversationLines(checkIn.transcript) ?? [],
      photos: checkIn.photos.map((photo) => ({
        id: photo.id,
        url: photo.webUrl ?? photo.url,
        takenAt: photo.createdAt,
      })),
    })),
    previousUpdate: { sentAt: draft.createdAt, bodyText: draft.bodyText },
    pinnedPostscript: sponsorshipPostscript,
    type: "graduation",
    companionPageUrl: companionPageUrl(
      env.BETTER_AUTH_URL,
      draft.organization.slug,
      draft.resident.id,
    ),
  });

  const checkInIds = draft.resident.checkIns.map(({ id: checkInId }) => checkInId);
  const photoIds = new Set(photos.map(({ id: photoId }) => photoId));
  return prisma.$transaction(async (tx) => {
    const updated = await tx.sponsorUpdate.updateMany({
      where: { id, orgId, status: "draft", type: "graduation" },
      data: {
        subject: composed.subject,
        teaser: composed.teaser,
        bodyText: composed.bodyText,
        heroPhotoUrl: photos.find(({ id: photoId }) => photoId === composed.heroPhotoId)?.url
          ?? draft.heroPhotoUrl
          ?? draft.resident.photoUrls[0]
          ?? null,
      },
    });
    if (updated.count !== 1) return "conflict";

    const claimed = await tx.checkIn.updateMany({
      where: {
        id: { in: checkInIds },
        orgId,
        residentId: draft.resident.id,
        status: "completed",
        sponsorUpdateId: null,
      },
      data: { sponsorUpdateId: id },
    });
    if (claimed.count !== checkInIds.length) throw new Error("Graduation chats were claimed elsewhere");

    await Promise.all(composed.captions
      .filter(({ photoId }) => photoIds.has(photoId))
      .map(({ photoId, caption }) => tx.volunteerPhoto.update({
        where: { id: photoId },
        data: { caption },
      })));
    return "composed";
  }, { timeout: 20_000 }).catch((error) => {
    if (error instanceof Error && error.message === "Graduation chats were claimed elsewhere") {
      return "conflict" as const;
    }
    throw error;
  });
}
