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
});

export const maxDuration = 800;

function conversationLines(transcript: unknown): string[] | undefined {
  const parsed = interviewTranscriptSchema.safeParse(transcript);
  if (!parsed.success) return undefined;
  const lines = parsed.data
    .map((message) => ({
      role: message.role,
      text: messageText(message).replace("[[READY]]", "").trim(),
    }))
    .filter(({ text }) => text)
    .map(
      ({ role, text }) =>
        `${role === "user" ? "Volunteer" : "Interviewer"}: ${text}`,
    );
  return lines.length > 0 ? lines : undefined;
}

export async function POST(request: Request) {
  const access = await requireApiOrganization(request.headers, {
    sponsorUpdate: ["manage"],
  });
  if (!access.ok) return access.response;
  const { orgId } = access.context;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }
  const input = composeRequestSchema.safeParse(body);
  if (!input.success) {
    return Response.json(
      { error: "residentId must be a UUID" },
      { status: 400 },
    );
  }

  const [resident, settings] = await Promise.all([
    prisma.resident.findFirst({
      where: { id: input.data.residentId, orgId },
      include: {
        organization: { select: { slug: true } },
        checkIns: {
          where: { status: "completed", sponsorUpdateId: null },
          orderBy: { updatedAt: "asc" },
          select: {
            id: true,
            updatedAt: true,
            transcript: true,
            photos: {
              orderBy: { createdAt: "asc" },
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
  if (!resident) {
    return Response.json({ error: "Resident not found" }, { status: 404 });
  }

  if (!resident.available) {
    return Response.json(
      { error: "Regular updates can only be drafted for available companions" },
      { status: 409 },
    );
  }
  if (resident.checkIns.length === 0) {
    return Response.json(
      { error: "There are no pending chats to compose." },
      { status: 409 },
    );
  }

  const photos = resident.checkIns
    .flatMap((checkIn) => checkIn.photos)
    .map((photo) => ({
      id: photo.id,
      url: photo.webUrl ?? photo.url,
      takenAt: photo.createdAt,
    }));
  const previousUpdate = resident.sponsorUpdates[0];
  let composed;
  try {
    composed = await composeSponsorUpdate({
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
        transcript: conversationLines(checkIn.transcript) ?? [],
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
  } catch (error) {
    console.error("Update composition failed", error);
    return Response.json(
      { error: "Drafting the update failed. Please try again." },
      { status: 502 },
    );
  }

  const checkInIds = resident.checkIns.map((checkIn) => checkIn.id);
  const photoIds = new Set(photos.map((photo) => photo.id));
  const sponsorUpdate = await prisma.$transaction(
    async (tx) => {
      const draft = await tx.sponsorUpdate.create({
        data: {
          orgId,
          residentId: resident.id,
          type: "regular",
          subject: composed.subject,
          teaser: composed.teaser,
          bodyText: composed.bodyText,
          heroPhotoUrl:
            photos.find((photo) => photo.id === composed.heroPhotoId)?.url ??
            null,
        },
        select: { id: true },
      });

      await tx.checkIn.updateMany({
        where: { id: { in: checkInIds } },
        data: { sponsorUpdateId: draft.id },
      });
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

      return draft;
    },
    { timeout: 20_000 },
  );

  return Response.json({ id: sponsorUpdate.id }, { status: 201 });
}
