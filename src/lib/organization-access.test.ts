import assert from "node:assert/strict";
import test from "node:test";

import { organizationRoles } from "./auth.ts";
import {
  checkOrganizationPermission,
  forOrganization,
  requireApiOrganization,
} from "./organization-access.ts";

test("owners and admins can manage staff resources while billing remains owner-only", () => {
  for (const resource of ["sponsorUpdate", "settings", "members", "roster"] as const) {
    assert.equal(organizationRoles.owner.authorize({ [resource]: ["manage"] }).success, true);
    assert.equal(organizationRoles.admin.authorize({ [resource]: ["manage"] }).success, true);
  }
  assert.equal(organizationRoles.owner.authorize({ billing: ["manage"] }).success, true);
  assert.equal(organizationRoles.admin.authorize({ billing: ["manage"] }).success, false);
});

test("members manage updates while volunteers cannot, and both have limited staff access", () => {
  assert.equal(organizationRoles.member.authorize({ sponsorUpdate: ["manage"] }).success, true);
  assert.equal(organizationRoles.volunteer.authorize({ sponsorUpdate: ["manage"] }).success, false);

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

test("API organization access returns 401 when an organization slug request is unauthenticated", async () => {
  const access = await requireApiOrganization(
    new Headers({ "x-organization-slug": "paws" }),
    { roster: ["manage"] },
    {
      getAccessBySlug: async () => ({
        authenticated: false,
        context: null,
        organization: { id: "org-a", name: "Paws", slug: "paws" },
      }),
      getContext: async () => null,
      getSession: async () => null,
    },
  );

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.response.status, 401);
    assert.deepEqual(await access.response.json(), { error: "Sign-in required" });
  }
});

test("API organization access returns 403 when an authenticated slug request lacks membership", async () => {
  const access = await requireApiOrganization(
    new Headers({ "x-organization-slug": "paws" }),
    { roster: ["manage"] },
    {
      getAccessBySlug: async () => ({
        authenticated: true,
        context: null,
        organization: { id: "org-a", name: "Paws", slug: "paws" },
      }),
      getContext: async () => null,
      getSession: async () => null,
    },
  );

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.response.status, 403);
    assert.deepEqual(await access.response.json(), { error: "Organization membership required" });
  }
});

test("API organization access returns 401 when the default request is unauthenticated", async () => {
  const access = await requireApiOrganization(
    new Headers(),
    { roster: ["manage"] },
    {
      getAccessBySlug: async () => null,
      getContext: async () => null,
      getSession: async () => null,
    },
  );

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.response.status, 401);
    assert.deepEqual(await access.response.json(), { error: "Sign-in required" });
  }
});

test("API organization access returns 403 when an authenticated caller lacks active organization permission", async () => {
  const session = {
    session: { activeOrganizationId: "org-a" },
    user: { id: "user-a" },
  } as Awaited<ReturnType<typeof import("./auth-session.ts").getSession>>;
  const access = await requireApiOrganization(
    new Headers(),
    { roster: ["manage"] },
    {
      getAccessBySlug: async () => null,
      getContext: async () => null,
      getSession: async () => session,
    },
  );

  assert.equal(access.ok, false);
  if (!access.ok) {
    assert.equal(access.response.status, 403);
    assert.deepEqual(await access.response.json(), { error: "Organization membership required" });
  }
});
