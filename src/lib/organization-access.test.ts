import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeOrganization,
  authorizeOrganizationId,
  forOrganization,
} from "./organization-access.ts";

const session = {
  session: { activeOrganizationId: "org-a" },
  user: { id: "user-a" },
};

test("authorizes every recognized membership in the active organization by default", () => {
  for (const role of ["owner", "admin", "member", "volunteer"] as const) {
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
  for (const role of ["member", "volunteer"] as const) {
    assert.equal(
      authorizeOrganization(
        session,
        { organizationId: "org-a", userId: "user-a", role },
        ["owner", "admin"],
      ),
      null,
    );
  }
});

test("authorizes the organization named by a route independently of the active organization", () => {
  assert.deepEqual(
    authorizeOrganizationId(
      session,
      { organizationId: "org-b", userId: "user-a", role: "admin" },
      "org-b",
      ["owner", "admin"],
    ),
    { orgId: "org-b", userId: "user-a", role: "admin" },
  );
});

test("trusted organization scope replaces client-provided scope", () => {
  assert.deepEqual(forOrganization("org-a", { id: "companion-a", orgId: "org-b" }), {
    id: "companion-a",
    orgId: "org-a",
  });
});
