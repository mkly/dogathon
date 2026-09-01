import assert from "node:assert/strict";
import test from "node:test";

import { rosterSyncResultToast, type RosterSyncJobView } from "./roster-sync-client.ts";

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
