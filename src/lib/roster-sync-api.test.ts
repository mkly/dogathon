import assert from "node:assert/strict";
import test from "node:test";

import {
  createEnqueueRosterSyncHandler,
  createGetRosterSyncJobHandler,
} from "./roster-sync-api.ts";
import { RosterSyncJobNotFoundError } from "./roster-sync-queue.ts";
import type { RosterSyncJobView } from "./roster-sync-client.ts";

const queuedJob = {
  id: "job-1",
  status: "queued",
  trigger: "admin",
  summary: null,
  refusalReason: null,
  errorMessage: null,
} satisfies RosterSyncJobView;

function authorized(orgId: string) {
  return async () => ({
    ok: true as const,
    context: { orgId, role: "admin" as const, userId: "user-1" },
  });
}

test("the sync endpoint enqueues for the caller and returns the job immediately", async () => {
  let input: { orgId: string; requestedByUserId?: string } | undefined;
  const handler = createEnqueueRosterSyncHandler({
    authorize: authorized("org-1"),
    enqueue: async (nextInput) => {
      input = nextInput;
      return queuedJob;
    },
  });

  const response = await handler(new Request("https://app.example/api/sync", {
    method: "POST",
  }));

  assert.equal(response.status, 202);
  assert.deepEqual(input, { orgId: "org-1", requestedByUserId: "user-1" });
  assert.deepEqual(await response.json(), {
    id: "job-1",
    status: "queued",
    trigger: "admin",
    summary: null,
    refusalReason: null,
    errorMessage: null,
  });
});

test("the status endpoint cannot read a job through another organization", async () => {
  const handler = createGetRosterSyncJobHandler({
    authorize: authorized("org-2"),
    get: async (orgId, jobId) => {
      assert.equal(orgId, "org-2");
      assert.equal(jobId, queuedJob.id);
      throw new RosterSyncJobNotFoundError(jobId);
    },
  });

  const response = await handler(
    new Request(`https://app.example/api/sync/${queuedJob.id}`),
    queuedJob.id,
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Roster sync job not found" });
});
