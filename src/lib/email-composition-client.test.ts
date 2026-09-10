import assert from "node:assert/strict";
import test from "node:test";

import {
  emailCompositionPollExpired,
  EMAIL_COMPOSITION_POLL_TIMEOUT_MS,
  parsePendingEmailCompositionJob,
  pendingEmailCompositionJob,
} from "./email-composition-client.ts";

const queuedJob = {
  id: "job-1",
  status: "queued" as const,
  kind: "regular" as const,
  targetId: "resident-1",
  draftId: null,
  errorMessage: null,
};

test("serializes enough composition state to resume polling after navigation", () => {
  const pending = pendingEmailCompositionJob(
    queuedJob,
    "Drafted an update.",
    1_000,
  );
  const restored = parsePendingEmailCompositionJob(JSON.stringify(pending));

  assert.deepEqual(restored, {
    id: "job-1",
    success: "Drafted an update.",
    status: "queued",
    deadline: 1_000 + EMAIL_COMPOSITION_POLL_TIMEOUT_MS,
  });
  assert.equal(
    emailCompositionPollExpired(pending, pending.deadline - 1),
    false,
  );
  assert.equal(emailCompositionPollExpired(pending, pending.deadline), true);
});

test("rejects malformed persisted composition state", () => {
  assert.equal(parsePendingEmailCompositionJob("not json"), null);
  assert.equal(
    parsePendingEmailCompositionJob(
      JSON.stringify({ id: "job-1", success: "Done", status: "queued" }),
    ),
    null,
  );
  assert.equal(
    parsePendingEmailCompositionJob(
      JSON.stringify({
        id: "job-1",
        success: "Done",
        status: "completed",
        deadline: 10,
      }),
    ),
    null,
  );
});
