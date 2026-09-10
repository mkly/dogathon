import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "./env.ts";
import { createJobDrainHandler } from "./job-drain.ts";

const environment = parseEnvironment({
  DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
  CRON_SECRET: "scheduler-secret",
});

function request(secret = "scheduler-secret") {
  return new Request("https://app.example/api/jobs/drain", {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
}

test("drains email work even when the roster queue is empty", async () => {
  const calls: string[] = [];
  const handler = createJobDrainHandler({
    env: environment,
    drainComposition: async () => {
      calls.push("email");
      return { drained: true, job: {} as never };
    },
    drainRoster: async () => {
      calls.push("roster");
      return { drained: false };
    },
    drainPhotoCleanup: async () => {
      calls.push("photos");
      return { drained: false };
    },
  });

  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["email", "roster", "photos"]);
  assert.equal((await response.json()).drained, true);
});

test("an unauthorized drain never touches any queue", async () => {
  let calls = 0;
  const empty = async () => {
    calls += 1;
    return { drained: false as const };
  };
  const handler = createJobDrainHandler({
    env: environment,
    drainComposition: empty,
    drainRoster: empty,
    drainPhotoCleanup: empty,
  });
  assert.equal((await handler(request("wrong"))).status, 401);
  assert.equal(calls, 0);
});
