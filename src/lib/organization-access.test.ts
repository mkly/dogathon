import assert from "node:assert/strict";
import test from "node:test";

import { authorizeOrganization, forOrganization } from "./organization-access.ts";

const session = {
  session: { activeOrganizationId: "org-a" },
  user: { id: "user-a" },
};

test("authorizes owner, admin, and volunteer membership in the active organization", () => {
  for (const role of ["owner", "admin", "member"] as const) {
    assert.deepEqual(
      authorizeOrganization(session, { organizationId: "org-a", userId: "user-a", role }),
      { orgId: "org-a", userId: "user-a", role },
    );
  }
});

test("rejects cross-organization membership and disallowed roles", () => {
  assert.equal(
    authorizeOrganization(session, { organizationId: "org-b", userId: "user-a", role: "owner" }),
    null,
  );
  assert.equal(
    authorizeOrganization(
      session,
      { organizationId: "org-a", userId: "user-a", role: "member" },
      ["owner", "admin"],
    ),
    null,
  );
});

test("trusted organization scope replaces client-provided scope", () => {
  assert.deepEqual(forOrganization("org-a", { id: "dog-a", orgId: "org-b" }), {
    id: "dog-a",
    orgId: "org-a",
  });
});
