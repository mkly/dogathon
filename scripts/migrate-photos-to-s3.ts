import { photoKey, putPhoto } from "../src/lib/photo-storage.ts";
import { prisma } from "../src/lib/prisma.ts";

type InlinePhoto = {
  createdAt: Date;
  id: string;
  orgId: string;
  photoData: Uint8Array;
  photoMime: string | null;
  residentId: string;
};

function extensionFor(mime: string) {
  switch (mime) {
    case "image/gif": return "gif";
    case "image/png": return "png";
    case "image/webp": return "webp";
    default: return "jpg";
  }
}

async function migrateInlinePhotos() {
  const notes = await prisma.$queryRaw<InlinePhoto[]>`
    SELECT "id", "orgId", "residentId", "photoData", "photoMime", "createdAt"
    FROM "VolunteerNote"
    WHERE "photoData" IS NOT NULL
    ORDER BY "createdAt" ASC
  `;
  let migrated = 0;
  let skipped = 0;

  for (const note of notes) {
    const existing = await prisma.volunteerPhoto.findUnique({ where: { id: note.id } });
    if (existing) {
      skipped += 1;
      continue;
    }

    const mime = note.photoMime ?? "image/jpeg";
    const storageKey = photoKey({
      orgId: note.orgId,
      photoId: note.id,
      ext: extensionFor(mime),
    });
    const { url } = await putPhoto({ key: storageKey, data: note.photoData, mime });

    await prisma.$transaction([
      prisma.volunteerPhoto.create({
        data: {
          id: note.id,
          orgId: note.orgId,
          residentId: note.residentId,
          noteId: note.id,
          storageKey,
          url,
          mime,
          byteSize: note.photoData.byteLength,
          createdAt: note.createdAt,
        },
      }),
      prisma.volunteerNote.update({
        where: { id: note.id },
        data: { photoUrl: url },
      }),
    ]);
    migrated += 1;
  }

  console.info(`Volunteer photo migration complete: ${migrated} migrated, ${skipped} skipped.`);
}

migrateInlinePhotos()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
