import { prisma } from "./prisma.ts";

export type PupdatePhotoSource = {
  residentId: string;
  createdAt: Date;
};

/**
 * The picture for a pupdate is the one a volunteer attached to the notes it was
 * written from, not the dog's profile shot. Nothing in the schema links a
 * pupdate to its notes, but the composer only ever reads notes that already
 * exist, so the newest note photo at drafting time is the update's photo. The
 * profile shot is the backstop for a dog whose notes came in without pictures.
 */
export async function pupdatePhotoUrl(
  pupdate: PupdatePhotoSource,
  profilePhotoUrl: string | null,
): Promise<string | null> {
  const note = await prisma.volunteerNote.findFirst({
    where: {
      residentId: pupdate.residentId,
      photoUrl: { not: null },
      createdAt: { lte: pupdate.createdAt },
    },
    orderBy: { createdAt: "desc" },
    select: { photoUrl: true },
  });

  return note?.photoUrl ?? profilePhotoUrl;
}
