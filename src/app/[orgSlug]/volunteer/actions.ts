"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { revalidatePublicRoster } from "@/lib/public-roster-cache";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { summarizeInterview } from "@/lib/volunteer-interview";
import { interviewRequestSchema } from "@/lib/volunteer-interview-request";
import { attachVolunteerPhotos } from "@/lib/volunteer-photos";

const finishCheckInSchema = interviewRequestSchema.omit({ orgSlug: true }).extend({
  photoIds: z.array(z.uuid()).max(20),
});

function volunteerUrl(orgSlug: string, params: Record<string, string>) {
  return `/${encodeURIComponent(orgSlug)}/volunteer?${new URLSearchParams(params).toString()}`;
}

export async function finishCheckIn(orgSlug: string, rawInput: unknown) {
  const parsedOrgSlug = z.string().trim().min(1).max(200).safeParse(orgSlug);
  if (!parsedOrgSlug.success) notFound();
  const safeOrgSlug = parsedOrgSlug.data;
  const access = await getOrganizationAccessBySlug(await headers(), safeOrgSlug, {
    roster: ["contribute"],
  });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${safeOrgSlug}/volunteer`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const rateLimit = await checkRateLimit({ ...RATE_LIMITS.volunteerCheckIn, identity: `user:${context.userId}`, scope: "volunteer-checkin-summary" });
  if (!rateLimit.allowed) redirect(volunteerUrl(safeOrgSlug, { error: "rate-limited" }));

  const parsed = finishCheckInSchema.safeParse(rawInput);
  if (!parsed.success) throw new Error("The check-in details are invalid.");
  const { residentId, messages, photoIds } = parsed.data;

  const resident = await prisma.resident.findFirst({
    where: {
      id: residentId,
      orgId: context.orgId,
      status: "available",
      sponsorships: { some: { status: "active" } },
    },
    select: { ageText: true, breed: true, id: true, name: true, sex: true },
  });

  if (!resident) throw new Error("That companion is no longer available.");

  const { note } = await summarizeInterview({
    companion: resident,
    messages,
    orgName: access.organization.name,
  });

  const noteId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.volunteerNote.create({
      data: {
        id: noteId,
        orgId: context.orgId,
        note,
        residentId,
      },
    });

    const photoUrl = await attachVolunteerPhotos(tx, {
      noteId,
      orgId: context.orgId,
      photoIds,
      residentId,
    });
    if (photoUrl) {
      await tx.volunteerNote.update({ where: { id: noteId }, data: { photoUrl } });
    }
  });

  revalidatePublicRoster();

  redirect(volunteerUrl(safeOrgSlug, { companion: residentId, submitted: "1" }));
}
