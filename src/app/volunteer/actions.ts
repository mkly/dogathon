"use server";

import { randomUUID } from "node:crypto";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

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

function volunteerUrl(params: Record<string, string>) {
  return `/volunteer?${new URLSearchParams(params).toString()}`;
}

function volunteerErrorUrl(error: VolunteerErrorCode) {
  return volunteerUrl({ error });
}

export async function submitVolunteerNote(formData: FormData) {
  const residentId = String(formData.get("residentId") ?? "").trim();
  const note = String(formData.get("note") ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const photo = formData.get("photo");

  if (!residentId) {
    redirect(volunteerErrorUrl("no-dog"));
  }

  if (!note) {
    redirect(volunteerErrorUrl("no-note"));
  }

  if (note.length > 240) {
    redirect(volunteerErrorUrl("note-too-long"));
  }

  const resident = await prisma.resident.findFirst({
    where: {
      id: residentId,
      status: "available",
      sponsorships: { some: { status: "active" } },
    },
    select: { id: true },
  });

  if (!resident) {
    redirect(volunteerErrorUrl("unavailable"));
  }

  // Photos live in the database, not the filesystem — Vercel functions are
  // read-only outside /tmp and anything under public/ is frozen at build time.
  let photoData: Uint8Array<ArrayBuffer> | undefined;
  let photoMime: string | undefined;

  if (photo instanceof File && photo.size > 0) {
    if (!PHOTO_EXTENSIONS[photo.type]) {
      redirect(volunteerErrorUrl("photo-type"));
    }

    if (photo.size > MAX_PHOTO_BYTES) {
      redirect(volunteerErrorUrl("photo-size"));
    }

    photoData = new Uint8Array(await photo.arrayBuffer());
    photoMime = photo.type;
  }

  const noteId = randomUUID();
  await prisma.volunteerNote.create({
    data: {
      id: noteId,
      note,
      photoUrl: photoData ? `/api/volunteer-photos/${noteId}` : undefined,
      photoData,
      photoMime,
      residentId,
    },
  });

  redirect(volunteerUrl({ dog: residentId, submitted: "1" }));
}
