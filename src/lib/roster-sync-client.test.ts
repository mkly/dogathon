import assert from "node:assert/strict";
import test from "node:test";

import {
  rosterSyncStatusLabel,
  rosterSyncResultToast,
  type RosterSyncJobView,
} from "./roster-sync-client.ts";

const summary = {
  created: 1,
  updated: 2,
  adopted: 0,
    madeUnavailable: 0,
  madeAvailable: 0,
  usedFallbackCapture: false,
  rosterComplete: true,
  rosterCompleteness: {
    complete: true,
    timedOut: false,
    status: "completed",
    completed: 3,
    total: 3,
  },
  source: "https://rescue.example/companions",
};

function job(overrides: Partial<RosterSyncJobView>): RosterSyncJobView {
  return {
    id: "job-1",
    status: "queued",
    trigger: "admin",
    summary: null,
    refusalReason: null,
    errorMessage: null,
    ...overrides,
  };
}

test("scheduled jobs are identified as automatic in the staff room", () => {
  assert.equal(
    rosterSyncStatusLabel(job({ status: "running", trigger: "scheduled" })),
    "Automatic roster sync running",
  );
  assert.equal(rosterSyncStatusLabel(job({ status: "queued" })), "Roster sync queued");
});

test("a successful job preserves the existing live and fallback result meanings", () => {
  assert.deepEqual(
    rosterSyncResultToast(job({ status: "succeeded", summary })),
    {
      tone: "success",
      text: "Roster synced from live source (https://rescue.example/companions).",
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
      refusalReason: "The parsed roster would mark most residents unavailable.",
    })),
    {
      tone: "error",
      text: "Unable to sync at this time. The parsed roster would mark most residents unavailable.",
    },
  );
});

test("an incomplete crawl is presented as a partial sync that left residents alone", () => {
  assert.deepEqual(
    rosterSyncResultToast(job({
      status: "succeeded",
      summary: {
        ...summary,
        rosterComplete: false,
        rosterCompleteness: {
          complete: false,
          timedOut: true,
          status: "scraping",
          completed: 2,
          total: 5,
        },
      },
    })),
    {
      tone: "warning",
      text: "Partial roster synced from https://rescue.example/companions."
        + " About 3 of 5 expected pages were not fetched."
        + " Missing residents were left unchanged.",
    },
  );
});
