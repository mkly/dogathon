import type { Prisma } from "@/generated/prisma/client";

type AttachVolunteerPhotosInput = {
  checkInId: string;
  maxByteSize: number;
  orgId: string;
  residentId: string;
  noteId: string;
};

type VolunteerPhotoTransaction = Pick<Prisma.TransactionClient, "volunteerPhoto">;

/** Claims all photos from a completed check-in and returns the oldest URL. */
export async function attachVolunteerPhotos(
  tx: VolunteerPhotoTransaction,
  input: AttachVolunteerPhotosInput,
): Promise<string | undefined> {
  await tx.volunteerPhoto.updateMany({
    where: {
      byteSize: { lte: input.maxByteSize },
      checkInId: input.checkInId,
      noteId: null,
      orgId: input.orgId,
      residentId: input.residentId,
    },
    data: { noteId: input.noteId },
  });

  const attached = await tx.volunteerPhoto.findMany({
    where: {
      byteSize: { lte: input.maxByteSize },
      checkInId: input.checkInId,
      noteId: input.noteId,
      orgId: input.orgId,
      residentId: input.residentId,
    },
    orderBy: { createdAt: "asc" },
    select: { url: true },
    take: 1,
  });
  return attached[0]?.url;
}
