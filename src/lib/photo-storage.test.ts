import assert from "node:assert/strict";
import test from "node:test";

import { photoKey } from "./photo-storage.ts";

test("builds the organization-scoped volunteer photo key", () => {
  assert.equal(
    photoKey({ orgId: "org-123", photoId: "photo-456", ext: ".jpeg" }),
    "orgs/org-123/volunteer-photos/photo-456.jpeg",
  );
});
