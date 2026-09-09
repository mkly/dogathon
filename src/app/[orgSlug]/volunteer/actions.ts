"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { deletePhoto } from "@/lib/photo-storage";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { interviewTranscriptSchema, MAX_INTERVIEW_MESSAGES, textOnlyTranscript } from "@/lib/volunteer-interview-request";
import { uuidSchema } from "@/lib/uuid";

function sessionUrl(orgSlug: string, checkInId: string, error?: string) {
  const path = `/${encodeURIComponent(orgSlug)}/volunteer/${encodeURIComponent(checkInId)}`;
  return error ? `${path}?${new URLSearchParams({ error }).toString()}` : path;
}

async function requireVolunteerAccess(orgSlug: string, nextPath: string) {
  const parsed = z.string().trim().min(1).max(200).safeParse(orgSlug);
  if (!parsed.success) notFound();
  const access = await getOrganizationAccessBySlug(await headers(), parsed.data, {
    roster: ["contribute"],
  });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(nextPath);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  return { ...access, context: access.context, orgSlug: parsed.data };
}

export async function startCheckIn(orgSlug: string, residentId: string) {
  const resident = uuidSchema.safeParse(residentId);
  if (!resident.success) notFound();
  const access = await requireVolunteerAccess(orgSlug, `/${orgSlug}/volunteer`);

  const companion = await prisma.resident.findFirst({
    where: {
      id: resident.data,
      orgId: access.context.orgId,
      available: true,
      sponsorships: { some: { status: "active" } },
    },
    select: { id: true },
  });
  if (!companion) redirect(`/${access.orgSlug}/volunteer?error=unavailable`);

  const checkIn = await prisma.checkIn.create({
    data: {
      orgId: access.context.orgId,
      residentId: companion.id,
      transcript: [],
      userId: access.context.userId,
    },
    select: { id: true },
  });
  redirect(sessionUrl(access.orgSlug, checkIn.id));
}

export async function discardCheckIn(orgSlug: string, rawCheckInId: unknown) {
  const checkInId = uuidSchema.safeParse(rawCheckInId);
  if (!checkInId.success) notFound();
  const access = await requireVolunteerAccess(orgSlug, `/${orgSlug.trim()}/volunteer`);

  const photos = await prisma.volunteerPhoto.findMany({
    where: {
      checkIn: {
        id: checkInId.data,
        orgId: access.context.orgId,
        status: "in_progress",
        userId: access.context.userId,
      },
      checkInId: checkInId.data,
    },
    select: { id: true, storageKey: true },
  });
  const deleted = await prisma.checkIn.deleteMany({
    where: {
      id: checkInId.data,
      orgId: access.context.orgId,
      status: "in_progress",
      userId: access.context.userId,
    },
  });
  if (deleted.count === 1 && photos.length > 0) {
    await prisma.volunteerPhoto.deleteMany({ where: { id: { in: photos.map((photo) => photo.id) } } });
    await Promise.all(photos.map(async (photo) => {
      try {
        await deletePhoto(photo.storageKey);
      } catch (error) {
        console.error("volunteer photo could not be removed from storage", error);
      }
    }));
  }

  revalidatePath(`/${access.orgSlug}/volunteer`);
}

export async function finishCheckIn(orgSlug: string, rawCheckInId: unknown, rawMessages: unknown) {
  const checkInId = uuidSchema.safeParse(rawCheckInId);
  if (!checkInId.success) notFound();
  const access = await requireVolunteerAccess(orgSlug, sessionUrl(orgSlug.trim(), checkInId.data));

  const rateLimit = await checkRateLimit({
    ...RATE_LIMITS.volunteerCheckIn,
    identity: `user:${access.context.userId}`,
    scope: "volunteer-checkin-finish",
  });
  if (!rateLimit.allowed) redirect(sessionUrl(access.orgSlug, checkInId.data, "rate-limited"));

  // The chat client sends its own copy of the conversation because the stream
  // it may have just cut off never reached the server-side save.
  const transcript = interviewTranscriptSchema.min(1).max(MAX_INTERVIEW_MESSAGES).safeParse(rawMessages);
  if (!transcript.success || !transcript.data.some((message) => message.role === "user")) {
    redirect(sessionUrl(access.orgSlug, checkInId.data, "invalid"));
  }
  const messages = textOnlyTranscript(transcript.data);

  const completed = await prisma.checkIn.updateMany({
    where: {
      id: checkInId.data,
      orgId: access.context.orgId,
      status: "in_progress",
      userId: access.context.userId,
    },
    data: { status: "completed", transcript: messages },
  });
  if (completed.count !== 1) notFound();

  redirect(sessionUrl(access.orgSlug, checkInId.data));
}
