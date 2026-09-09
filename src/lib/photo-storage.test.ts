import assert from "node:assert/strict";
import test from "node:test";

import { photoKey, webPhotoKey } from "./photo-storage.ts";

test("builds the organization-scoped volunteer photo key", () => {
  const key = photoKey({
    orgId: "org-123",
    photoId: "photo-456",
    ext: ".jpeg",
  });
  assert.equal(key, "orgs/org-123/volunteer-photos/photo-456.jpeg");
  assert.equal(
    webPhotoKey(key),
    "orgs/org-123/volunteer-photos/photo-456-web.jpeg",
  );
});
