import "server-only";

import { composeSponsorUpdate } from "./composer.ts";
import { env } from "./env.ts";
import { messageText } from "./ui-message-text.ts";
import { companionPageUrl } from "./sponsor-update-delivery.ts";
import { prisma } from "./prisma.ts";
import { interviewTranscriptSchema } from "./volunteer-interview-request.ts";

export type RegularCompositionResult =
  "composed" | "not-found" | "not-available" | "no-pending-chats" | "conflict";

function conversationLines(transcript: unknown): string[] {
  const parsed = interviewTranscriptSchema.safeParse(transcript);
  if (!parsed.success) return [];
  return parsed.data
    .map((message) => ({
      role: message.role,
      text: messageText(message).replace("[[READY]]", "").trim(),
    }))
    .filter(({ text }) => text)
    .map(
      ({ role, text }) =>
        `${role === "user" ? "Volunteer" : "Interviewer"}: ${text}`,
    );
}

/** Compose one deterministic draft ID so a worker retry cannot create two drafts. */
export async function composeRegularDraft(
  draftId: string,
  residentId: string,
  orgId: string,
  signal?: AbortSignal,
): Promise<RegularCompositionResult> {
  const existing = await prisma.sponsorUpdate.findFirst({
    where: { id: draftId, orgId, residentId, type: "regular" },
    select: { id: true },
  });
  if (existing) return "composed";

  const [resident, settings] = await Promise.all([
    prisma.resident.findFirst({
      where: { id: residentId, orgId },
      include: {
        organization: { select: { slug: true } },
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
        sponsorUpdates: {
          where: { status: "sent", sentAt: { not: null } },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { sentAt: true, bodyText: true },
        },
      },
    }),
    prisma.rescueSettings.findUnique({ where: { orgId } }),
  ]);
  signal?.throwIfAborted();
  if (!resident) return "not-found";
  if (!resident.available) return "not-available";
  if (resident.checkIns.length === 0) return "no-pending-chats";

  const photos = resident.checkIns.flatMap((checkIn) =>
    checkIn.photos.map((photo) => ({
      id: photo.id,
      url: photo.webUrl ?? photo.url,
      takenAt: photo.createdAt,
    })),
  );
  const previousUpdate = resident.sponsorUpdates[0];
  const composed = await composeSponsorUpdate({
    signal,
    companion: {
      name: resident.name,
      available: resident.available,
      breed: resident.breed,
      sex: resident.sex,
      ageText: resident.ageText,
      personality: resident.personality,
    },
    chats: resident.checkIns.map((checkIn) => ({
      completedAt: checkIn.updatedAt,
      transcript: conversationLines(checkIn.transcript),
      photos: checkIn.photos.map((photo) => ({
        id: photo.id,
        url: photo.webUrl ?? photo.url,
        takenAt: photo.createdAt,
      })),
    })),
    previousUpdate: previousUpdate?.sentAt
      ? { sentAt: previousUpdate.sentAt, bodyText: previousUpdate.bodyText }
      : undefined,
    pinnedPostscript: settings?.pinnedPostscript ?? "",
    type: "regular",
    companionPageUrl: companionPageUrl(
      env.BETTER_AUTH_URL,
      resident.organization.slug,
      resident.id,
    ),
  });
  signal?.throwIfAborted();

  const checkInIds = resident.checkIns.map(({ id }) => id);
  const photoIds = new Set(photos.map(({ id }) => id));
  return prisma
    .$transaction(
      async (tx) => {
        signal?.throwIfAborted();
        const stillEligible = await tx.resident.findFirst({
          where: { id: residentId, orgId, available: true },
          select: { id: true },
        });
        if (!stillEligible) return "conflict";
        await tx.sponsorUpdate.create({
          data: {
            id: draftId,
            orgId,
            residentId,
            type: "regular",
            subject: composed.subject,
            teaser: composed.teaser,
            bodyText: composed.bodyText,
            heroPhotoUrl:
              photos.find(({ id }) => id === composed.heroPhotoId)?.url ?? null,
          },
        });
        const claimed = await tx.checkIn.updateMany({
          where: {
            id: { in: checkInIds },
            orgId,
            residentId,
            status: "completed",
            sponsorUpdateId: null,
          },
          data: { sponsorUpdateId: draftId },
        });
        if (claimed.count !== checkInIds.length)
          throw new Error("Regular chats were claimed elsewhere");
        await Promise.all(
          composed.captions
            .filter(({ photoId }) => photoIds.has(photoId))
            .map(({ photoId, caption }) =>
              tx.volunteerPhoto.update({
                where: { id: photoId },
                data: { caption },
              }),
            ),
        );
        return "composed" as const;
      },
      { timeout: 20_000 },
    )
    .catch((error) => {
      if (
        error instanceof Error &&
        error.message === "Regular chats were claimed elsewhere"
      )
        return "conflict" as const;
      throw error;
    });
}
