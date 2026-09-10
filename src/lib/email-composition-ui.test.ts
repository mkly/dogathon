import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const staffRoomPage = readFile(
  new URL("../app/[orgSlug]/admin/(staff-room)/page.tsx", import.meta.url),
  "utf8",
);

test("a completed composition refresh remounts the editor with fresh draft content", async () => {
  assert.match(
    await staffRoomPage,
    /key=\{`\$\{draft\.id\}:\$\{draft\.updatedAt\.toISOString\(\)\}`\}/u,
  );
});
