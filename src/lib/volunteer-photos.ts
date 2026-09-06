import type { Prisma } from "@/generated/prisma/client";

type AttachVolunteerPhotosInput = {
  orgId: string;
  residentId: string;
  noteId: string;
  photoIds: string[];
};

type VolunteerPhotoTransaction = Pick<Prisma.TransactionClient, "volunteerPhoto">;

/**
 * Claims previously uploaded photos for a completed check-in and returns the
 * first attached URL in the order supplied by the client.
 */
export async function attachVolunteerPhotos(
  tx: VolunteerPhotoTransaction,
  input: AttachVolunteerPhotosInput,
): Promise<string | undefined> {
  const photoIds = [...new Set(input.photoIds)];
  if (photoIds.length === 0) return undefined;

  await tx.volunteerPhoto.updateMany({
    where: {
      id: { in: photoIds },
      noteId: null,
      orgId: input.orgId,
      residentId: input.residentId,
    },
    data: { noteId: input.noteId },
  });

  const attached = await tx.volunteerPhoto.findMany({
    where: {
      id: { in: photoIds },
      noteId: input.noteId,
      orgId: input.orgId,
      residentId: input.residentId,
    },
    select: { id: true, url: true },
  });
  const urls = new Map(attached.map((photo) => [photo.id, photo.url]));
  return photoIds.map((id) => urls.get(id)).find((url) => url !== undefined);
}
