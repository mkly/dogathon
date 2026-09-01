import assert from "node:assert/strict";
import test from "node:test";

import type { SyncSummary } from "./roster-sync.ts";
import { RosterSyncRefusal } from "./roster-sync.ts";
import {
  createRosterSyncDrainHandler,
  createRosterSyncDrainer,
} from "./roster-sync-drain.ts";

const summary: SyncSummary = {
  created: 1,
  updated: 0,
  adopted: 0,
  restored: 0,
  sponsorshipsClosed: 0,
  usedFallbackCapture: false,
  source: "https://rescue.example/dogs",
};

const claim = { id: "job-1", orgId: "org-1", claimToken: "claim-1" };

function terminalJob(status: "queued" | "succeeded" | "failed" | "refused") {
  return { id: claim.id, status, attempts: 1 };
}

test("the drain route refuses missing and incorrect secrets without claiming work", async () => {
  let calls = 0;
  const drain = async () => {
    calls += 1;
    return { drained: false as const };
  };
  const missingSecret = createRosterSyncDrainHandler({ drain, env: {} });
  const configured = createRosterSyncDrainHandler({
    drain,
    env: { ROSTER_SYNC_DRAIN_SECRET: "scheduler-secret" },
  });

  const missingResponse = await missingSecret(new Request("https://app.example/api/jobs/drain", {
    method: "POST",
    headers: { authorization: "Bearer scheduler-secret" },
  }));
  const wrongResponse = await configured(new Request("https://app.example/api/jobs/drain", {
    method: "POST",
    headers: { authorization: "Bearer wrong-secret" },
  }));

  assert.equal(missingResponse.status, 401);
  assert.equal(wrongResponse.status, 401);
  assert.equal(calls, 0);
});

test("a correct secret runs one job to success", async () => {
  let syncedOrgId = "";
  const drain = createRosterSyncDrainer({
    claim: async () => claim,
    heartbeat: async () => undefined,
    syncRoster: async (orgId) => {
      syncedOrgId = orgId;
      return summary;
    },
    succeed: async (input) => {
      assert.deepEqual(input.summary, summary);
      return terminalJob("succeeded");
    },
    refuse: async () => terminalJob("refused"),
    fail: async () => terminalJob("failed"),
  });
  const handler = createRosterSyncDrainHandler({
    drain,
    env: { ROSTER_SYNC_DRAIN_SECRET: "scheduler-secret" },
  });

  const response = await handler(new Request("https://app.example/api/jobs/drain", {
    method: "POST",
    headers: { authorization: "Bearer scheduler-secret" },
  }));

  assert.equal(response.status, 200);
  assert.equal(syncedOrgId, claim.orgId);
  assert.deepEqual(await response.json(), {
    drained: true,
    job: terminalJob("succeeded"),
  });
});

test("an empty queue is a successful no-op", async () => {
  const drain = createRosterSyncDrainer({
    claim: async () => null,
    heartbeat: async () => undefined,
    syncRoster: async () => summary,
    succeed: async () => terminalJob("succeeded"),
    refuse: async () => terminalJob("refused"),
    fail: async () => terminalJob("failed"),
  });

  assert.deepEqual(await drain(), { drained: false });
});

test("a roster refusal is recorded as refused with its reason", async () => {
  let recordedReason = "";
  const drain = createRosterSyncDrainer({
    claim: async () => claim,
    heartbeat: async () => undefined,
    syncRoster: async () => {
      throw new RosterSyncRefusal("Too many residents would be adopted");
    },
    succeed: async () => terminalJob("succeeded"),
    refuse: async (input) => {
      recordedReason = input.reason;
      return terminalJob("refused");
    },
    fail: async () => terminalJob("failed"),
  });

  const result = await drain();

  assert.equal(recordedReason, "Too many residents would be adopted");
  assert.deepEqual(result, { drained: true, job: terminalJob("refused") });
});

test("a budget overrun aborts the sync and leaves the job retryable", async () => {
  let aborted = false;
  let recordedError = "";
  const drain = createRosterSyncDrainer({
    claim: async () => claim,
    heartbeat: async () => undefined,
    syncRoster: async (_orgId, { signal }) => new Promise<SyncSummary>((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        aborted = true;
        reject(signal.reason);
      }, { once: true });
    }),
    succeed: async () => terminalJob("succeeded"),
    refuse: async () => terminalJob("refused"),
    fail: async (input) => {
      recordedError = input.error;
      return terminalJob("queued");
    },
  });

  const result = await drain({ budgetMs: 15, heartbeatMs: 5 });

  assert.equal(aborted, true);
  assert.match(recordedError, /15ms drain budget/u);
  assert.deepEqual(result, { drained: true, job: terminalJob("queued") });
});

test("a long-running sync extends its lease while it works", async () => {
  let heartbeats = 0;
  const drain = createRosterSyncDrainer({
    claim: async () => claim,
    heartbeat: async () => {
      heartbeats += 1;
    },
    syncRoster: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return summary;
    },
    succeed: async () => terminalJob("succeeded"),
    refuse: async () => terminalJob("refused"),
    fail: async () => terminalJob("failed"),
  });

  await drain({ budgetMs: 100, heartbeatMs: 5 });

  assert.ok(heartbeats >= 1);
});
