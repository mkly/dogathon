import assert from "node:assert/strict";
import test from "node:test";

import { parseEnvironment } from "./env.ts";
import { createSponsorshipGracePeriodScheduleHandler } from "./sponsorship-grace-period-schedule.ts";

const request = new Request("https://app.example/api/jobs/schedule-sponsorship-grace-period", {
  headers: { authorization: "Bearer scheduler-secret" },
});

function schedulerEnvironment(secret?: string) {
  return parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    CRON_SECRET: secret,
  });
}

test("the grace-period schedule route requires scheduler authorization", async () => {
  let listed = false;
  const handler = createSponsorshipGracePeriodScheduleHandler({
    env: schedulerEnvironment(),
    listOrganizations: async () => { listed = true; return []; },
  });

  const response = await handler(request);
  assert.equal(response.status, 401);
  assert.equal(listed, false);
});

test("the grace-period schedule enqueues one job per organization", async () => {
  const orgIds: string[] = [];
  const handler = createSponsorshipGracePeriodScheduleHandler({
    env: schedulerEnvironment("scheduler-secret"),
    listOrganizations: async () => [{ id: "org-1" }, { id: "org-2" }],
    enqueue: async (orgId) => {
      orgIds.push(orgId);
      return orgId === "org-1" ? "job-1" : null;
    },
  });

  const response = await handler(request);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { eligible: 2, enqueued: 1, skipped: 1, failed: 0 });
  assert.deepEqual(orgIds, ["org-1", "org-2"]);
});
