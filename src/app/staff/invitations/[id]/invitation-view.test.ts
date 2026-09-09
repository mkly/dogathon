import assert from "node:assert/strict";
import test from "node:test";

import { describeInvitationRole, invitationState } from "./invitation-view.ts";

const now = new Date("2026-09-04T18:00:00.000Z");

test("invitation state distinguishes every public landing-page outcome", () => {
  assert.equal(invitationState(null, now), "unknown");
  assert.equal(
    invitationState({ status: "accepted", expiresAt: now }, now),
    "accepted",
  );
  assert.equal(
    invitationState({ status: "canceled", expiresAt: now }, now),
    "cancelled",
  );
  assert.equal(
    invitationState({ status: "rejected", expiresAt: now }, now),
    "cancelled",
  );
  assert.equal(
    invitationState(
      { status: "pending", expiresAt: new Date(now.getTime() - 1) },
      now,
    ),
    "expired",
  );
  assert.equal(
    invitationState(
      { status: "pending", expiresAt: new Date(now.getTime() + 1) },
      now,
    ),
    "pending",
  );
});

test("assignable invitation roles explain their access in plain words", () => {
  for (const role of ["admin", "member", "volunteer"]) {
    const detail = describeInvitationRole(role);
    assert.ok(detail.label.length > 0);
    assert.match(detail.description, /\.$/);
  }
  assert.equal(describeInvitationRole("admin").article, "an");
  assert.equal(describeInvitationRole("volunteer").article, "a");
});
