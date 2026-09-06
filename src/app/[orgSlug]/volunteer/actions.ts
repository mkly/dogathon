"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { getOrganizationAccessBySlug } from "@/lib/organization-access";
import { deletePhoto, photoKey, putPhoto } from "@/lib/photo-storage";
import { prisma } from "@/lib/prisma";
import { revalidatePublicRoster } from "@/lib/public-roster-cache";
import { uuidSchema } from "@/lib/uuid";

import type { VolunteerErrorCode } from "./errors";
import { MAX_PHOTO_BYTES, processVolunteerPhoto } from "./photo";
const volunteerOrganizationSchema = z.object({ orgSlug: z.string().trim().min(1) });
const volunteerNoteSchema = z.object({
  residentId: z.string().trim(),
  note: z.string().transform((value) => value.replace(/\s+/g, " ").trim()),
  photo: z.file().optional().catch(undefined),
});

function volunteerUrl(orgSlug: string, params: Record<string, string>) {
  return `/${encodeURIComponent(orgSlug)}/volunteer?${new URLSearchParams(params).toString()}`;
}

function volunteerErrorUrl(orgSlug: string, error: VolunteerErrorCode) {
  return volunteerUrl(orgSlug, { error });
}

export async function submitVolunteerNote(formData: FormData) {
  const rawInput = Object.fromEntries(formData);
  const organizationInput = volunteerOrganizationSchema.safeParse(rawInput);
  if (!organizationInput.success) notFound();
  const { orgSlug } = organizationInput.data;
  const access = await getOrganizationAccessBySlug(await headers(), orgSlug, {
    roster: ["contribute"],
  });
  if (!access) notFound();
  if (!access.context) {
    const next = encodeURIComponent(`/${orgSlug}/volunteer`);
    redirect(access.authenticated ? "/staff/organizations" : `/staff/sign-in?next=${next}`);
  }
  const { context } = access;

  const parsed = volunteerNoteSchema.safeParse(rawInput);
  if (!parsed.success) redirect(volunteerErrorUrl(orgSlug, "no-note"));
  const { residentId, note, photo } = parsed.data;

  if (!uuidSchema.safeParse(residentId).success) {
    redirect(volunteerErrorUrl(orgSlug, "no-companion"));
  }

  if (!note) {
    redirect(volunteerErrorUrl(orgSlug, "no-note"));
  }

  if (note.length > 2_000) {
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

  let storedPhoto: {
    id: string;
    key: string;
    mime: string;
    size: number;
    url: string;
  } | undefined;

  if (photo && photo.size > 0) {
    if (photo.size > MAX_PHOTO_BYTES) {
      redirect(volunteerErrorUrl(orgSlug, "photo-size"));
    }

    const processedPhoto = await processVolunteerPhoto(new Uint8Array(await photo.arrayBuffer()));
    if (!processedPhoto) {
      redirect(volunteerErrorUrl(orgSlug, "photo-type"));
    }

    const id = randomUUID();
    const key = photoKey({ orgId: context.orgId, photoId: id, ext: "jpg" });
    const { url } = await putPhoto({ key, data: processedPhoto.data, mime: processedPhoto.mime });
    storedPhoto = {
      id,
      key,
      mime: processedPhoto.mime,
      size: processedPhoto.data.byteLength,
      url,
    };
  }

  const noteId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.volunteerNote.create({
        data: {
          id: noteId,
          orgId: context.orgId,
          note,
          photoUrl: storedPhoto?.url,
          residentId,
        },
      });
      if (storedPhoto) {
        await tx.volunteerPhoto.create({
          data: {
            id: storedPhoto.id,
            orgId: context.orgId,
            residentId,
            noteId,
            storageKey: storedPhoto.key,
            url: storedPhoto.url,
            mime: storedPhoto.mime,
            byteSize: storedPhoto.size,
          },
        });
      }
    });
  } catch (error) {
    if (storedPhoto) await deletePhoto(storedPhoto.key).catch(() => undefined);
    throw error;
  }

  revalidatePublicRoster();

  redirect(volunteerUrl(orgSlug, { companion: residentId, submitted: "1" }));
}
