import { deletePhoto } from "./photo-storage.ts";
import { prisma } from "./prisma.ts";

export const ORPHAN_PHOTO_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type OrphanPhoto = { id: string; storageKey: string };

type CleanupDependencies = {
  deletePhoto: (key: string) => Promise<void>;
  deleteRows: (ids: string[]) => Promise<void>;
  findOrphans: (olderThan: Date) => Promise<OrphanPhoto[]>;
};

const defaults: CleanupDependencies = {
  deletePhoto,
  async deleteRows(ids) {
    await prisma.volunteerPhoto.deleteMany({ where: { id: { in: ids }, noteId: null } });
  },
  async findOrphans(olderThan) {
    return prisma.volunteerPhoto.findMany({
      where: { createdAt: { lt: olderThan }, noteId: null },
      select: { id: true, storageKey: true },
      take: 100,
    });
  },
};

/** Deletes unattached uploads only after their grace period has elapsed. */
export async function cleanupVolunteerPhotos(
  dependencies: Partial<CleanupDependencies> = {},
  now = new Date(),
) {
  const services = { ...defaults, ...dependencies };
  const photos = await services.findOrphans(new Date(now.getTime() - ORPHAN_PHOTO_MAX_AGE_MS));
  for (const photo of photos) await services.deletePhoto(photo.storageKey);
  await services.deleteRows(photos.map((photo) => photo.id));
  return { deleted: photos.length };
}
