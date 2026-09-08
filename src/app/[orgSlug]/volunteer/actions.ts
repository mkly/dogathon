"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { summarizeInterview } from "@/lib/volunteer-interview";
import { interviewTranscriptSchema, textOnlyTranscript } from "@/lib/volunteer-interview-request";
import { attachVolunteerPhotos } from "@/lib/volunteer-photos";
import { uuidSchema } from "@/lib/uuid";

import { MAX_PHOTO_BYTES } from "./photo-limits";

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

export async function finishCheckIn(orgSlug: string, rawCheckInId: unknown) {
  const checkInId = uuidSchema.safeParse(rawCheckInId);
  if (!checkInId.success) notFound();
  const access = await requireVolunteerAccess(orgSlug, sessionUrl(orgSlug.trim(), checkInId.data));

  const rateLimit = await checkRateLimit({
    ...RATE_LIMITS.volunteerCheckIn,
    identity: `user:${access.context.userId}`,
    scope: "volunteer-checkin-summary",
  });
  if (!rateLimit.allowed) redirect(sessionUrl(access.orgSlug, checkInId.data, "rate-limited"));

  const checkIn = await prisma.checkIn.findFirst({
    where: {
      id: checkInId.data,
      orgId: access.context.orgId,
      status: "in_progress",
      userId: access.context.userId,
    },
    select: {
      resident: { select: { ageText: true, breed: true, id: true, name: true, sex: true } },
      transcript: true,
    },
  });
  if (!checkIn) notFound();

  const transcript = interviewTranscriptSchema.min(1).safeParse(checkIn.transcript);
  if (!transcript.success) redirect(sessionUrl(access.orgSlug, checkInId.data, "invalid"));
  const messages = textOnlyTranscript(transcript.data);

  let note: string;
  try {
    ({ note } = await summarizeInterview({
      companion: checkIn.resident,
      messages,
      orgName: access.organization.name,
    }));
  } catch (error) {
    console.error("volunteer check-in summary failed", error);
    redirect(sessionUrl(access.orgSlug, checkInId.data, "summary"));
  }

  try {
    const noteId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.volunteerNote.create({
        data: {
          id: noteId,
          orgId: access.context.orgId,
          note,
          residentId: checkIn.resident.id,
        },
      });

      const photoUrl = await attachVolunteerPhotos(tx, {
        checkInId: checkInId.data,
        maxByteSize: MAX_PHOTO_BYTES,
        noteId,
        orgId: access.context.orgId,
        residentId: checkIn.resident.id,
      });
      if (photoUrl) {
        await tx.volunteerNote.update({ where: { id: noteId }, data: { photoUrl } });
      }
      const completed = await tx.checkIn.updateMany({
        where: {
          id: checkInId.data,
          orgId: access.context.orgId,
          status: "in_progress",
          userId: access.context.userId,
        },
        data: { noteId, status: "completed" },
      });
      if (completed.count !== 1) throw new Error("Check-in was already completed");
    });
  } catch (error) {
    console.error("volunteer check-in save failed", error);
    redirect(sessionUrl(access.orgSlug, checkInId.data, "save"));
  }

  redirect(sessionUrl(access.orgSlug, checkInId.data));
}
