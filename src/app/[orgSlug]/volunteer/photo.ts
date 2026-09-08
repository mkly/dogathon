import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { MAX_PHOTO_BYTES } from "./photo-limits";

const MAX_PHOTO_DIMENSION = 2048;

// HEIC/HEIF are absent: sharp's prebuilt libvips carries no HEVC decoder, so
// accepting them here would only fail later in the re-encode.
const ALLOWED_PHOTO_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type ProcessedVolunteerPhoto = {
  data: Uint8Array<ArrayBuffer>;
  mime: "image/jpeg";
};

/**
 * Validates an uploaded photo from its binary signature, then normalizes it to
 * a bounded JPEG. The output intentionally retains no input metadata.
 */
export async function processVolunteerPhoto(
  input: Uint8Array,
): Promise<ProcessedVolunteerPhoto | undefined> {
  if (input.byteLength > MAX_PHOTO_BYTES) {
    return undefined;
  }

  const detectedType = await fileTypeFromBuffer(input);
  if (!detectedType || !ALLOWED_PHOTO_MIME_TYPES.has(detectedType.mime)) {
    return undefined;
  }

  try {
    const data = await sharp(input, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: MAX_PHOTO_DIMENSION,
        height: MAX_PHOTO_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();

    return { data: new Uint8Array(data), mime: "image/jpeg" };
  } catch {
    return undefined;
  }
}

// The interview model only needs enough of the photo to describe the scene,
// and the vision endpoint fails on larger images, so a small copy goes to it.
export const INTERVIEW_PHOTO_DIMENSION = 512;

export async function shrinkPhotoForInterview(input: Uint8Array): Promise<{ data: Uint8Array; mime: "image/jpeg" }> {
  const data = await sharp(input)
    .resize({
      width: INTERVIEW_PHOTO_DIMENSION,
      height: INTERVIEW_PHOTO_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 80 })
    .toBuffer();
  return { data: new Uint8Array(data), mime: "image/jpeg" };
}
