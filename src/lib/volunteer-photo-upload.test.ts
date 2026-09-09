import assert from "node:assert/strict";
import test from "node:test";

import { parseVolunteerPhotoUpload } from "./volunteer-photo-upload.ts";

const checkInId = "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8";

test("parses the volunteer photo multipart fields", () => {
  const formData = new FormData();
  formData.set("orgSlug", " huffy-puff ");
  formData.set("checkInId", checkInId);
  formData.set(
    "photo",
    new File([Uint8Array.from([1, 2])], "walk.jpg", {
      type: "image/jpeg",
    }),
  );

  const result = parseVolunteerPhotoUpload(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.orgSlug, "huffy-puff");
    assert.equal(result.data.checkInId, checkInId);
    assert.equal(result.data.photo.name, "walk.jpg");
  }
});

test("rejects missing files and malformed check-in ids", () => {
  const missingPhoto = new FormData();
  missingPhoto.set("orgSlug", "huffy-puff");
  missingPhoto.set("checkInId", checkInId);
  assert.equal(parseVolunteerPhotoUpload(missingPhoto).success, false);

  const badCheckIn = new FormData();
  badCheckIn.set("orgSlug", "huffy-puff");
  badCheckIn.set("checkInId", "not-a-uuid");
  badCheckIn.set("photo", new File([Uint8Array.from([1])], "walk.jpg"));
  assert.equal(parseVolunteerPhotoUpload(badCheckIn).success, false);
});
