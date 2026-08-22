"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

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

  let savedPhotoPath: string | undefined;
  let photoUrl: string | undefined;

  if (photo instanceof File && photo.size > 0) {
    const extension = PHOTO_EXTENSIONS[photo.type];

    if (!extension) {
      redirect(volunteerErrorUrl("photo-type"));
    }

    if (photo.size > MAX_PHOTO_BYTES) {
      redirect(volunteerErrorUrl("photo-size"));
    }

    const uploadDirectory = path.join(process.cwd(), "public", "uploads");
    const fileName = `${randomUUID()}${extension}`;
    savedPhotoPath = path.join(uploadDirectory, fileName);
    photoUrl = `/uploads/${fileName}`;

    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(savedPhotoPath, Buffer.from(await photo.arrayBuffer()), {
      flag: "wx",
    });
  }

  try {
    await prisma.volunteerNote.create({
      data: {
        note,
        photoUrl,
        residentId,
      },
    });
  } catch (error) {
    if (savedPhotoPath) {
      await unlink(savedPhotoPath).catch(() => undefined);
    }
    throw error;
  }

  redirect(volunteerUrl({ dog: residentId, submitted: "1" }));
}
