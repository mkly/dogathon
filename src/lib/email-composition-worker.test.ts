import assert from "node:assert/strict";
import test from "node:test";

import type { EmailCompositionJobView } from "./email-composition-client.ts";
import type { ClaimedEmailCompositionJob } from "./email-composition-queue.ts";
import { createEmailCompositionDrainer } from "./email-composition-worker.ts";

const claim: ClaimedEmailCompositionJob = {
  id: "job-1",
  name: "email-composition",
  data: {
    orgId: "org-1",
    requestedByUserId: "user-1",
    kind: "regular",
    targetId: "resident-1",
    draftId: "draft-1",
  },
  expireInSeconds: 240,
  heartbeatSeconds: null,
};

function view(
  status: EmailCompositionJobView["status"],
): EmailCompositionJobView {
  return {
    id: claim.id,
    status,
    kind: "regular",
    targetId: "resident-1",
    draftId: status === "completed" ? "draft-1" : null,
    errorMessage: null,
  };
}

test("composes a claimed job and records its deterministic draft id", async () => {
  let completed = "";
  const drain = createEmailCompositionDrainer({
    fetch: async () => claim,
    composeRegular: async (draftId, residentId, orgId) => {
      assert.deepEqual(
        [draftId, residentId, orgId],
        ["draft-1", "resident-1", "org-1"],
      );
      return "composed";
    },
    composeGraduation: async () => "not-found",
    complete: async (_jobId, draftId) => {
      completed = draftId;
      return view("completed");
    },
    fail: async () => view("failed"),
    reject: async () => view("failed"),
  });

  assert.deepEqual(await drain({ budgetMs: 1_000 }), {
    drained: true,
    job: view("completed"),
  });
  assert.equal(completed, "draft-1");
});

test("records a safe failure when job eligibility changed", async () => {
  let message = "";
  const drain = createEmailCompositionDrainer({
    fetch: async () => claim,
    composeRegular: async () => "conflict",
    composeGraduation: async () => "not-found",
    complete: async () => view("completed"),
    fail: async () => view("failed"),
    reject: async (_jobId, error) => {
      message = error;
      return { ...view("failed"), errorMessage: error };
    },
  });

  const result = await drain();
  assert.equal(result.drained, true);
  assert.match(message, /already used/);
});

test("fails a composition that exceeds its drain budget", async () => {
  let message = "";
  const drain = createEmailCompositionDrainer({
    fetch: async () => claim,
    composeRegular: async (_draftId, _residentId, _orgId, signal) =>
      new Promise((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
    composeGraduation: async () => "not-found",
    complete: async () => view("completed"),
    fail: async (_jobId, error) => {
      message = error;
      return { ...view("failed"), errorMessage: error };
    },
    reject: async () => view("failed"),
  });

  const result = await drain({ budgetMs: 10 });
  assert.equal(result.drained, true);
  assert.match(message, /exceeded its 10ms drain budget/);
});

test("an empty composition queue is a successful no-op", async () => {
  const drain = createEmailCompositionDrainer({
    fetch: async () => null,
    composeRegular: async () => "composed",
    composeGraduation: async () => "composed",
    complete: async () => view("completed"),
    fail: async () => view("failed"),
    reject: async () => view("failed"),
  });
  assert.deepEqual(await drain(), { drained: false });
});
