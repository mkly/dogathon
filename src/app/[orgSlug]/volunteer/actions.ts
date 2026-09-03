"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { isUuid } from "@/lib/uuid";

import type { VolunteerErrorCode } from "./errors";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const PHOTO_EXTENSIONS: Record<string, string> = {
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function volunteerUrl(orgSlug: string, params: Record<string, string>) {
  return `/${encodeURIComponent(orgSlug)}/volunteer?${new URLSearchParams(params).toString()}`;
}

function volunteerErrorUrl(orgSlug: string, error: VolunteerErrorCode) {
  return volunteerUrl(orgSlug, { error });
}

export async function submitVolunteerNote(formData: FormData) {
  const orgSlug = String(formData.get("orgSlug") ?? "").trim();
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug);
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/volunteer`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const residentId = String(formData.get("residentId") ?? "").trim();
  const note = String(formData.get("note") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const photo = formData.get("photo");

  if (!isUuid(residentId)) {
    redirect(volunteerErrorUrl(orgSlug, "no-companion"));
  }

  if (!note) {
    redirect(volunteerErrorUrl(orgSlug, "no-note"));
  }

  if (note.length > 240) {
    redirect(volunteerErrorUrl(orgSlug, "note-too-long"));
  }

  const resident = await prisma.resident.findFirst({
    where: {
      id: residentId,
      orgId: context.orgId,
      status: "available",
      sponsorships: { some: { status: "active" } },
    },
    select: { id: true },
  });

  if (!resident) {
    redirect(volunteerErrorUrl(orgSlug, "unavailable"));
  }

  // Photos live in the database, not the filesystem — Vercel functions are
  // read-only outside /tmp and anything under public/ is frozen at build time.
  let photoData: Uint8Array<ArrayBuffer> | undefined;
  let photoMime: string | undefined;

  if (photo instanceof File && photo.size > 0) {
    if (!PHOTO_EXTENSIONS[photo.type]) {
      redirect(volunteerErrorUrl(orgSlug, "photo-type"));
    }

    if (photo.size > MAX_PHOTO_BYTES) {
      redirect(volunteerErrorUrl(orgSlug, "photo-size"));
    }

    photoData = new Uint8Array(await photo.arrayBuffer());
    photoMime = photo.type;
  }

  const noteId = randomUUID();
  await prisma.volunteerNote.create({
    data: {
      id: noteId,
      orgId: context.orgId,
      note,
      photoUrl: photoData
        ? `/api/volunteer-photos/${noteId}?org=${encodeURIComponent(context.orgId)}`
        : undefined,
      photoData,
      photoMime,
      residentId,
    },
  });

  redirect(volunteerUrl(orgSlug, { companion: residentId, submitted: "1" }));
}
