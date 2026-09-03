import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import { processVolunteerPhoto } from "./photo";

test("accepts a recognized image and normalizes its orientation, dimensions, and metadata", async () => {
  const input = await sharp({
    create: { width: 3_000, height: 1_000, channels: 3, background: "#e9a" },
  })
    .withMetadata({ orientation: 6 })
    .png()
    .toBuffer();

  const photo = await processVolunteerPhoto(input);

  assert.ok(photo);
  assert.equal(photo.mime, "image/jpeg");

  const metadata = await sharp(photo.data).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width <= 2_048);
  assert.ok(metadata.height <= 2_048);
  assert.equal(metadata.orientation, undefined);
});

test("rejects data without an allowed image signature", async () => {
  const photo = await processVolunteerPhoto(new Uint8Array([0, 1, 2, 3]));

  assert.equal(photo, undefined);
});
