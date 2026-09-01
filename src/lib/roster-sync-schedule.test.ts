import assert from "node:assert/strict";
import test from "node:test";

import type { RosterSyncJob } from "@/generated/prisma/client";

import { createRosterSyncScheduleHandler } from "./roster-sync-schedule.ts";

const request = new Request("https://app.example/api/jobs/schedule-roster-sync", {
  headers: { authorization: "Bearer scheduler-secret" },
});

function queuedJob(orgId: string): RosterSyncJob {
  return { id: `job-${orgId}`, orgId, status: "queued", trigger: "scheduled" } as RosterSyncJob;
}

test("the schedule route requires the same bearer secret as the drain route", async () => {
  let listed = false;
  const handler = createRosterSyncScheduleHandler({
    env: {},
    listOrganizations: async () => {
      listed = true;
      return [];
    },
  });

  const response = await handler(request);

  assert.equal(response.status, 401);
  assert.equal(listed, false);
});

test("eligible organizations are staggered and existing work is skipped", async () => {
  const inputs: Array<{ orgId: string; trigger: "scheduled"; availableAt: Date }> = [];
  const handler = createRosterSyncScheduleHandler({
    env: {
      CRON_SECRET: "scheduler-secret",
      ROSTER_SYNC_SCHEDULE_STAGGER_MS: "60000",
    },
    now: () => new Date("2026-09-02T08:00:00.000Z"),
    listOrganizations: async () => [
      { orgId: "org-1" },
      { orgId: "org-2" },
      { orgId: "org-3" },
    ],
    enqueue: async (input) => {
      inputs.push(input);
      return { job: queuedJob(input.orgId), enqueued: input.orgId !== "org-2" };
    },
  });

  const response = await handler(request);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { eligible: 3, enqueued: 2, skipped: 1, failed: 0 });
  assert.deepEqual(
    inputs.map(({ orgId, trigger, availableAt }) => ({
      orgId,
      trigger,
      availableAt: availableAt.toISOString(),
    })),
    [
      { orgId: "org-1", trigger: "scheduled", availableAt: "2026-09-02T08:00:00.000Z" },
      { orgId: "org-2", trigger: "scheduled", availableAt: "2026-09-02T08:01:00.000Z" },
      { orgId: "org-3", trigger: "scheduled", availableAt: "2026-09-02T08:02:00.000Z" },
    ],
  );
});

test("one enqueue failure does not prevent later organizations", async () => {
  const attempted: string[] = [];
  const handler = createRosterSyncScheduleHandler({
    env: { ROSTER_SYNC_DRAIN_SECRET: "scheduler-secret" },
    listOrganizations: async () => [
      { orgId: "org-1" },
      { orgId: "org-2" },
      { orgId: "org-3" },
    ],
    enqueue: async (input) => {
      attempted.push(input.orgId);
      if (input.orgId === "org-2") throw new Error("database unavailable");
      return { job: queuedJob(input.orgId), enqueued: true };
    },
  });

  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await handler(request);
    assert.deepEqual(await response.json(), { eligible: 3, enqueued: 2, skipped: 0, failed: 1 });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(attempted, ["org-1", "org-2", "org-3"]);
});
