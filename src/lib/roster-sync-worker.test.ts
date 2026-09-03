import assert from "node:assert/strict";
import test from "node:test";

import type { ClaimedRosterSyncJob } from "./roster-sync-queue.ts";
import type { RosterSyncJobView } from "./roster-sync-client.ts";
import type { SyncSummary } from "./roster-sync.ts";
import { RosterSyncRefusal } from "./roster-sync.ts";
import {
  createRosterSyncDrainHandler,
  createRosterSyncDrainer,
} from "./roster-sync-worker.ts";

const summary: SyncSummary = {
  created: 1,
  updated: 0,
  adopted: 0,
  restored: 0,
  sponsorshipsClosed: 0,
  usedFallbackCapture: false,
  rosterComplete: true,
  rosterCompleteness: {
    complete: true,
    timedOut: false,
    status: "completed",
    completed: 1,
    total: 1,
  },
  source: "https://rescue.example/companions",
};

const claim: ClaimedRosterSyncJob = {
  id: "job-1",
  name: "roster-sync",
  data: { orgId: "org-1", trigger: "admin" },
  expireInSeconds: 300,
  heartbeatSeconds: null,
  signal: new AbortController().signal,
};

function job(status: RosterSyncJobView["status"]): RosterSyncJobView {
  return {
    id: claim.id,
    status,
    trigger: "admin",
    summary: status === "succeeded" ? summary : null,
    refusalReason: null,
    errorMessage: null,
  };
}

function dependencies(overrides: Partial<Parameters<typeof createRosterSyncDrainer>[0]> = {}) {
  return {
    fetch: async () => claim,
    syncRoster: async () => summary,
    succeed: async () => job("succeeded"),
    refuse: async () => job("refused"),
    fail: async () => job("failed"),
    ...overrides,
  };
}

test("the drain route refuses missing and incorrect secrets without fetching work", async () => {
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

test("a correct secret fetches and explicitly completes one job", async () => {
  let completed = "";
  const drain = createRosterSyncDrainer(dependencies({
    succeed: async (jobId, nextSummary) => {
      completed = jobId;
      assert.deepEqual(nextSummary, summary);
      return job("succeeded");
    },
  }));
  const handler = createRosterSyncDrainHandler({
    drain,
    env: { ROSTER_SYNC_DRAIN_SECRET: "scheduler-secret" },
  });

  const response = await handler(new Request("https://app.example/api/jobs/drain", {
    method: "POST",
    headers: { authorization: "Bearer scheduler-secret" },
  }));

  assert.equal(response.status, 200);
  assert.equal(completed, claim.id);
  assert.deepEqual(await response.json(), { drained: true, job: job("succeeded") });
});

test("an empty queue is a successful no-op", async () => {
  const drain = createRosterSyncDrainer(dependencies({ fetch: async () => null }));
  assert.deepEqual(await drain(), { drained: false });
});

test("a roster refusal is completed with a refused outcome", async () => {
  let recordedReason = "";
  const drain = createRosterSyncDrainer(dependencies({
    syncRoster: async () => {
      throw new RosterSyncRefusal("Too many residents would be adopted");
    },
    refuse: async (_jobId, reason) => {
      recordedReason = reason;
      return job("refused");
    },
  }));

  assert.deepEqual(await drain(), { drained: true, job: job("refused") });
  assert.equal(recordedReason, "Too many residents would be adopted");
});

test("a budget overrun aborts the sync and explicitly fails the job", async () => {
  let recordedError = "";
  const drain = createRosterSyncDrainer(dependencies({
    syncRoster: async (_orgId, { signal }) => new Promise<SyncSummary>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
    fail: async (_jobId, error) => {
      recordedError = error;
      return job("queued");
    },
  }));

  assert.deepEqual(await drain({ budgetMs: 15 }), { drained: true, job: job("queued") });
  assert.match(recordedError, /15ms drain budget/u);
});
