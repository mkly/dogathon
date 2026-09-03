import assert from "node:assert/strict";
import test from "node:test";

import { organizationRoles } from "./auth.ts";
import { checkOrganizationPermission, forOrganization } from "./organization-access.ts";

test("owners and admins can manage staff resources while billing remains owner-only", () => {
  for (const resource of ["pupdate", "settings", "members", "roster"] as const) {
    assert.equal(organizationRoles.owner.authorize({ [resource]: ["manage"] }).success, true);
    assert.equal(organizationRoles.admin.authorize({ [resource]: ["manage"] }).success, true);
  }
  assert.equal(organizationRoles.owner.authorize({ billing: ["manage"] }).success, true);
  assert.equal(organizationRoles.admin.authorize({ billing: ["manage"] }).success, false);
});

test("member and volunteer roles can contribute roster notes but cannot enter staff areas", () => {
  for (const role of [organizationRoles.member, organizationRoles.volunteer]) {
    assert.equal(role.authorize({ roster: ["contribute"] }).success, true);
    assert.equal(role.authorize({ roster: ["manage"] }).success, false);
    assert.equal(role.authorize({ sponsors: ["read"] }).success, false);
  }
});

test("trusted organization scope replaces client-provided scope", () => {
  assert.deepEqual(forOrganization("org-a", { id: "companion-a", orgId: "org-b" }), {
    id: "companion-a",
    orgId: "org-a",
  });
});

test("permission checks fail closed when better-auth rejects the caller", async () => {
  const headers = new Headers();
  const api = {
    hasPermission: async () => {
      throw new Error("You are not a member of this organization");
    },
  } as unknown as Parameters<typeof checkOrganizationPermission>[3];

  assert.equal(
    await checkOrganizationPermission(headers, "org-a", { roster: ["contribute"] }, api),
    false,
  );
});

test("permission checks pass through the better-auth verdict", async () => {
  const headers = new Headers();
  const verdicts = [true, false];
  for (const success of verdicts) {
    const api = {
      hasPermission: async () => ({ error: null, success }),
    } as unknown as Parameters<typeof checkOrganizationPermission>[3];

    assert.equal(
      await checkOrganizationPermission(headers, "org-a", { billing: ["manage"] }, api),
      success,
    );
  }
});
