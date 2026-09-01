import assert from "node:assert/strict";
import test from "node:test";

import { removalBlockedReason, roleChangeBlockedReason } from "./member-management";

const basePolicy = {
  actorRole: "owner" as const,
  actorUserId: "actor",
  ownerCount: 2,
  targetRole: "member" as const,
  targetUserId: "target",
};

test("the last owner cannot be demoted or removed", () => {
  const policy = { ...basePolicy, ownerCount: 1, targetRole: "owner" as const };

  assert.match(roleChangeBlockedReason(policy) ?? "", /last owner/i);
  assert.match(removalBlockedReason(policy) ?? "", /last owner/i);
});

test("an admin cannot change or remove an owner", () => {
  const policy = { ...basePolicy, actorRole: "admin" as const, targetRole: "owner" as const };

  assert.match(roleChangeBlockedReason(policy) ?? "", /Admins cannot change/i);
  assert.match(removalBlockedReason(policy) ?? "", /Admins cannot remove/i);
});

test("a member cannot remove themselves from the list", () => {
  const policy = { ...basePolicy, actorUserId: "target" };

  assert.match(removalBlockedReason(policy) ?? "", /cannot remove yourself/i);
});

test("permitted member changes have no policy error", () => {
  assert.equal(roleChangeBlockedReason(basePolicy), null);
  assert.equal(removalBlockedReason(basePolicy), null);
});
