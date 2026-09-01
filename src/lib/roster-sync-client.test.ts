import assert from "node:assert/strict";
import test from "node:test";

import {
  pollRosterSyncJobUntilTerminal,
  rosterSyncResultToast,
  type RosterSyncJobView,
} from "./roster-sync-client.ts";

const summary = {
  created: 1,
  updated: 2,
  adopted: 0,
  restored: 0,
  sponsorshipsClosed: 0,
  usedFallbackCapture: false,
  source: "https://rescue.example/dogs",
};

function job(overrides: Partial<RosterSyncJobView>): RosterSyncJobView {
  return {
    id: "job-1",
    status: "queued",
    summary: null,
    refusalReason: null,
    errorMessage: null,
    ...overrides,
  };
}

test("a successful job preserves the existing live and fallback result meanings", () => {
  assert.deepEqual(
    rosterSyncResultToast(job({ status: "succeeded", summary })),
    {
      tone: "success",
      text: "Roster synced from live source (https://rescue.example/dogs).",
    },
  );
  assert.deepEqual(
    rosterSyncResultToast(job({
      status: "succeeded",
      summary: { ...summary, usedFallbackCapture: true, source: "dogs-page-A.html" },
    })),
    {
      tone: "warning",
      text: "Roster synced from bundled capture (dogs-page-A.html).",
    },
  );
});

test("a refused job is presented as a refusal with its reason", () => {
  assert.deepEqual(
    rosterSyncResultToast(job({
      status: "refused",
      refusalReason: "The parsed roster would adopt most residents.",
    })),
    {
      tone: "error",
      text: "Unable to sync at this time. The parsed roster would adopt most residents.",
    },
  );
});

test("polling follows a job to its terminal state and reports every update", async () => {
  const states: RosterSyncJobView[] = [
    job({ status: "running" }),
    job({ status: "succeeded", summary }),
  ];
  const seen: string[] = [];

  const outcome = await pollRosterSyncJobUntilTerminal(job({ status: "queued" }), {
    fetchJob: async () => states.shift()!,
    onUpdate: (next) => seen.push(next.status),
    wait: async () => {},
  });

  assert.deepEqual(seen, ["running", "succeeded"]);
  assert.equal(outcome.done, true);
  assert.equal(outcome.job.status, "succeeded");
});

test("polling stops at its deadline instead of waiting on a drain that never runs", async () => {
  let clock = 0;
  let polls = 0;

  const outcome = await pollRosterSyncJobUntilTerminal(job({ status: "queued" }), {
    fetchJob: async () => {
      polls += 1;
      return job({ status: "queued" });
    },
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    now: () => clock,
    intervalMs: 1_000,
    timeoutMs: 3_000,
  });

  assert.deepEqual(outcome, { done: false, reason: "timeout", job: job({ status: "queued" }) });
  assert.equal(polls, 3);
});

test("polling stops as soon as the caller has gone away", async () => {
  let polls = 0;

  const outcome = await pollRosterSyncJobUntilTerminal(job({ status: "queued" }), {
    fetchJob: async () => {
      polls += 1;
      return job({ status: "queued" });
    },
    wait: async () => {},
    cancelled: () => polls >= 1,
  });

  assert.equal(outcome.done, false);
  assert.equal(outcome.done === false ? outcome.reason : null, "cancelled");
  assert.equal(polls, 1);
});
