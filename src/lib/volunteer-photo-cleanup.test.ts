import assert from "node:assert/strict";
import test from "node:test";

import {
  cleanupVolunteerPhotos,
  ORPHAN_PHOTO_MAX_AGE_MS,
} from "./volunteer-photo-cleanup.ts";

test("orphan photo cleanup removes only uploads older than the retention period", async () => {
  const now = new Date("2026-09-06T12:00:00Z");
  let cutoff: Date | undefined;
  const deletedKeys: string[] = [];
  let deletedRows: string[] = [];

  const result = await cleanupVolunteerPhotos(
    {
      async findOrphans(olderThan) {
        cutoff = olderThan;
        return [
          {
            id: "old-photo",
            storageKey: "orgs/a/volunteer-photos/old.jpg",
            webStorageKey: "orgs/a/volunteer-photos/old-web.jpg",
          },
        ];
      },
      async deletePhoto(key) {
        deletedKeys.push(key);
      },
      async deleteRows(ids) {
        deletedRows = ids;
      },
    },
    now,
  );

  assert.equal(cutoff?.getTime(), now.getTime() - ORPHAN_PHOTO_MAX_AGE_MS);
  assert.deepEqual(deletedKeys, [
    "orgs/a/volunteer-photos/old.jpg",
    "orgs/a/volunteer-photos/old-web.jpg",
  ]);
  assert.deepEqual(deletedRows, ["old-photo"]);
  assert.deepEqual(result, { deleted: 1 });
});
