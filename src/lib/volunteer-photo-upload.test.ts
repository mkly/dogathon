import assert from "node:assert/strict";
import test from "node:test";

import { parseVolunteerPhotoUpload } from "./volunteer-photo-upload.ts";

const residentId = "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8";

test("parses the volunteer photo multipart fields", () => {
  const formData = new FormData();
  formData.set("orgSlug", " huffy-puff ");
  formData.set("residentId", residentId);
  formData.set("photo", new File([Uint8Array.from([1, 2])], "walk.jpg", {
    type: "image/jpeg",
  }));

  const result = parseVolunteerPhotoUpload(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.orgSlug, "huffy-puff");
    assert.equal(result.data.residentId, residentId);
    assert.equal(result.data.photo.name, "walk.jpg");
  }
});

test("rejects missing files and malformed resident ids", () => {
  const missingPhoto = new FormData();
  missingPhoto.set("orgSlug", "huffy-puff");
  missingPhoto.set("residentId", residentId);
  assert.equal(parseVolunteerPhotoUpload(missingPhoto).success, false);

  const badResident = new FormData();
  badResident.set("orgSlug", "huffy-puff");
  badResident.set("residentId", "not-a-uuid");
  badResident.set("photo", new File([Uint8Array.from([1])], "walk.jpg"));
  assert.equal(parseVolunteerPhotoUpload(badResident).success, false);
});
