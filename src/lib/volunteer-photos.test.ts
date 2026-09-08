import assert from "node:assert/strict";
import test from "node:test";

import { attachVolunteerPhotos } from "./volunteer-photos.ts";

test("attaches only photos scoped to the check-in and returns the oldest URL", async () => {
  const calls: unknown[] = [];
  const tx = {
    volunteerPhoto: {
      async updateMany(input: unknown) {
        calls.push(input);
        return { count: 2 };
      },
      async findMany(input: unknown) {
        calls.push(input);
        return [{ url: "/one.jpg" }];
      },
    },
  };

  const url = await attachVolunteerPhotos(tx as never, {
    checkInId: "check-in-1",
    maxByteSize: 8_388_608,
    orgId: "org-1",
    residentId: "resident-1",
    noteId: "note-1",
  });

  assert.equal(url, "/one.jpg");
  assert.deepEqual(calls, [
    {
      where: {
        byteSize: { lte: 8_388_608 },
        checkInId: "check-in-1",
        noteId: null,
        orgId: "org-1",
        residentId: "resident-1",
      },
      data: { noteId: "note-1" },
    },
    {
      where: {
        byteSize: { lte: 8_388_608 },
        checkInId: "check-in-1",
        noteId: "note-1",
        orgId: "org-1",
        residentId: "resident-1",
      },
      orderBy: { createdAt: "asc" },
      select: { url: true },
      take: 1,
    },
  ]);
});

test("returns undefined when a check-in has no photos", async () => {
  const tx = {
    volunteerPhoto: {
      async updateMany() { return { count: 0 }; },
      async findMany() { return []; },
    },
  };

  assert.equal(await attachVolunteerPhotos(tx as never, {
    checkInId: "check-in-1",
    maxByteSize: 8_388_608,
    orgId: "org-1",
    residentId: "resident-1",
    noteId: "note-1",
  }), undefined);
});
