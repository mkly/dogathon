import assert from "node:assert/strict";
import test from "node:test";

import { createRosterSyncScheduleHandler } from "./roster-sync-schedule.ts";
import type { RosterSyncJobView } from "./roster-sync-client.ts";
import { parseEnvironment } from "./env.ts";

const request = new Request("https://app.example/api/jobs/schedule-roster-sync", {
  headers: { authorization: "Bearer scheduler-secret" },
});

function schedulerEnvironment(overrides: Record<string, string | undefined> = {}) {
  return parseEnvironment({
    DATABASE_URL: "postgresql://dogathon:dogathon@localhost:5432/dogathon",
    ...overrides,
  });
}

function queuedJob(orgId: string): RosterSyncJobView {
  return {
    id: `job-${orgId}`,
    status: "queued",
    trigger: "scheduled",
    summary: null,
    refusalReason: null,
    errorMessage: null,
  };
}

test("the schedule route requires the same bearer secret as the drain route", async () => {
  let listed = false;
  const handler = createRosterSyncScheduleHandler({
    env: schedulerEnvironment(),
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
  const inputs: Array<{ orgId: string; trigger: "scheduled"; startAfter: Date }> = [];
  const handler = createRosterSyncScheduleHandler({
    env: schedulerEnvironment({
      CRON_SECRET: "scheduler-secret",
      ROSTER_SYNC_SCHEDULE_STAGGER_MS: "60000",
    }),
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
    inputs.map(({ orgId, trigger, startAfter }) => ({
      orgId,
      trigger,
      startAfter: startAfter.toISOString(),
    })),
    [
      { orgId: "org-1", trigger: "scheduled", startAfter: "2026-09-02T08:00:00.000Z" },
      { orgId: "org-2", trigger: "scheduled", startAfter: "2026-09-02T08:01:00.000Z" },
      { orgId: "org-3", trigger: "scheduled", startAfter: "2026-09-02T08:02:00.000Z" },
    ],
  );
});

test("one enqueue failure does not prevent later organizations", async () => {
  const attempted: string[] = [];
  const handler = createRosterSyncScheduleHandler({
    env: schedulerEnvironment({ ROSTER_SYNC_DRAIN_SECRET: "scheduler-secret" }),
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
