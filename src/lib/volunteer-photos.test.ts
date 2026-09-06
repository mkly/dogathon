import assert from "node:assert/strict";
import test from "node:test";

import { attachVolunteerPhotos } from "./volunteer-photos.ts";

test("attaches only scoped orphan photos and returns the first requested URL", async () => {
  const calls: unknown[] = [];
  const tx = {
    volunteerPhoto: {
      async updateMany(input: unknown) {
        calls.push(input);
        return { count: 2 };
      },
      async findMany(input: unknown) {
        calls.push(input);
        return [
          { id: "photo-2", url: "/two.jpg" },
          { id: "photo-1", url: "/one.jpg" },
        ];
      },
    },
  };

  const url = await attachVolunteerPhotos(tx as never, {
    orgId: "org-1",
    residentId: "resident-1",
    noteId: "note-1",
    photoIds: ["photo-1", "photo-2", "photo-1"],
  });

  assert.equal(url, "/one.jpg");
  assert.deepEqual(calls, [
    {
      where: {
        id: { in: ["photo-1", "photo-2"] },
        noteId: null,
        orgId: "org-1",
        residentId: "resident-1",
      },
      data: { noteId: "note-1" },
    },
    {
      where: {
        id: { in: ["photo-1", "photo-2"] },
        noteId: "note-1",
        orgId: "org-1",
        residentId: "resident-1",
      },
      select: { id: true, url: true },
    },
  ]);
});

test("does not query when there are no photos", async () => {
  const tx = {
    volunteerPhoto: {
      async updateMany() { throw new Error("unexpected update"); },
      async findMany() { throw new Error("unexpected query"); },
    },
  };

  assert.equal(await attachVolunteerPhotos(tx as never, {
    orgId: "org-1",
    residentId: "resident-1",
    noteId: "note-1",
    photoIds: [],
  }), undefined);
});
