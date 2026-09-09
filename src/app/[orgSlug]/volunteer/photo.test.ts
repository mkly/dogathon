import assert from "node:assert/strict";
import test from "node:test";

import { processVolunteerPhoto } from "./photo";

test("rejects data without an allowed image signature", async () => {
  const photo = await processVolunteerPhoto(new Uint8Array([0, 1, 2, 3]));

  assert.equal(photo, undefined);
});
