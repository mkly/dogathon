import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import test from "node:test";

const execFileAsync = promisify(execFile);

test("--all continues when only a nested queue reports drained false", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dogathon-drain-test-"));
  const countFile = path.join(directory, "count");
  const fakeCurl = path.join(directory, "curl");
  await writeFile(
    fakeCurl,
    `#!/bin/sh
count=0
if [ -f "$DRAIN_TEST_COUNT_FILE" ]; then count="$(sed -n '1p' "$DRAIN_TEST_COUNT_FILE")"; fi
count=$((count + 1))
printf '%s\\n' "$count" > "$DRAIN_TEST_COUNT_FILE"
if [ "$count" -eq 1 ]; then
  printf '%s\\n' '{"drained":true,"emailComposition":{"drained":false},"rosterSync":{"drained":true},"photoCleanup":{"drained":false}}'
else
  printf '%s\\n' '{"drained":false,"emailComposition":{"drained":false},"rosterSync":{"drained":false},"photoCleanup":{"drained":false}}'
fi
`,
  );
  await chmod(fakeCurl, 0o755);

  try {
    const { stdout } = await execFileAsync(
      "sh",
      ["scripts/drain-jobs.sh", "--all"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_URL: "https://app.example",
          CRON_SECRET: "test-secret",
          DRAIN_TEST_COUNT_FILE: countFile,
          PATH: `${directory}:${process.env.PATH ?? ""}`,
        },
      },
    );

    assert.equal((await readFile(countFile, "utf8")).trim(), "2");
    assert.equal(stdout.trim().split("\n").length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
