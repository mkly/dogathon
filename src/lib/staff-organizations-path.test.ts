import assert from "node:assert/strict";
import test from "node:test";

import {
  extractOrgSlugFromPath,
  isAuthorizedStaffMembership,
  isDefaultStaffDestination,
  resolveStaffSignInDestination,
  sanitizeStaffSignInNext,
  staffOrganizationsPath,
  staffOrganizationsSignInPath,
  type StaffOrganizationMembership,
  type StaffSignInDependencies,
} from "./staff-organizations-path.ts";

test("staff organizations sign-in path preserves and encodes the full requested path", () => {
  assert.equal(
    staffOrganizationsSignInPath({ foo: "bar" }),
    "/staff/sign-in?next=%2Fstaff%2Forganizations%3Ffoo%3Dbar",
  );
});

test("staff organizations path preserves repeated and empty search parameters", () => {
  assert.equal(
    staffOrganizationsPath({
      empty: "",
      filter: ["new", "urgent"],
      missing: undefined,
    }),
    "/staff/organizations?empty=&filter=new&filter=urgent",
  );
});

test("sanitizeStaffSignInNext accepts safe relative paths and rejects unsafe / loop destinations", () => {
  assert.equal(
    sanitizeStaffSignInNext("/hound-rescue/admin"),
    "/hound-rescue/admin",
  );
  assert.equal(
    sanitizeStaffSignInNext("/staff/invitations/123"),
    "/staff/invitations/123",
  );
  assert.equal(
    sanitizeStaffSignInNext(["/hound-rescue/admin"]),
    "/hound-rescue/admin",
  );
  assert.equal(sanitizeStaffSignInNext(undefined), null);
  assert.equal(sanitizeStaffSignInNext(""), null);
  assert.equal(sanitizeStaffSignInNext("   "), null);
  assert.equal(sanitizeStaffSignInNext("https://evil.com"), null);
  assert.equal(sanitizeStaffSignInNext("//evil.com"), null);
  assert.equal(sanitizeStaffSignInNext("/\\evil.com"), null);
  assert.equal(sanitizeStaffSignInNext("/staff/sign-in"), null);
  assert.equal(sanitizeStaffSignInNext("/staff/sign-in?next=/admin"), null);
  assert.equal(sanitizeStaffSignInNext("/test\nnewline"), null);
});

test("isDefaultStaffDestination identifies default staff landing paths", () => {
  assert.equal(isDefaultStaffDestination(undefined), true);
  assert.equal(isDefaultStaffDestination(null), true);
  assert.equal(isDefaultStaffDestination(""), true);
  assert.equal(isDefaultStaffDestination("/staff/organizations"), true);
  assert.equal(isDefaultStaffDestination("/staff/organizations/"), true);
  assert.equal(
    isDefaultStaffDestination(
      "/staff/organizations?error=invalid-organization",
    ),
    true,
  );
  assert.equal(isDefaultStaffDestination("/hound-rescue/admin"), false);
  assert.equal(isDefaultStaffDestination("/staff/invitations/inv-1"), false);
});

test("extractOrgSlugFromPath extracts org slug from admin and volunteer paths", () => {
  assert.equal(extractOrgSlugFromPath("/hound-rescue/admin"), "hound-rescue");
  assert.equal(
    extractOrgSlugFromPath("/hound-rescue/admin/settings"),
    "hound-rescue",
  );
  assert.equal(
    extractOrgSlugFromPath("/hound-rescue/volunteer"),
    "hound-rescue",
  );
  assert.equal(extractOrgSlugFromPath("/staff/organizations"), null);
  assert.equal(extractOrgSlugFromPath("/staff/invitations/123"), null);
  assert.equal(extractOrgSlugFromPath("/account"), null);
});

test("isAuthorizedStaffMembership only authorizes owner, admin, and member roles", () => {
  assert.equal(isAuthorizedStaffMembership("owner"), true);
  assert.equal(isAuthorizedStaffMembership("admin"), true);
  assert.equal(isAuthorizedStaffMembership("member"), true);
  assert.equal(isAuthorizedStaffMembership("volunteer"), false);
  assert.equal(isAuthorizedStaffMembership("unknown"), false);
});

function createMockDeps(orgs: StaffOrganizationMembership[]): {
  activated: string[];
  deps: StaffSignInDependencies;
} {
  const activated: string[] = [];
  return {
    activated,
    deps: {
      findOrganizations: async () => orgs,
      setActiveOrganization: async (orgId: string) => {
        activated.push(orgId);
      },
    },
  };
}

test("single-organization staff is activated and redirected directly to /[orgSlug]/admin", async () => {
  const org: StaffOrganizationMembership = {
    id: "org-single",
    name: "Happy Paws",
    slug: "happy-paws",
    role: "owner",
  };
  const { activated, deps } = createMockDeps([org]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    undefined,
    deps,
  );

  assert.equal(destination, "/happy-paws/admin");
  assert.deepEqual(activated, ["org-single"]);
});

test("single-organization staff signing in with default /staff/organizations lands directly in admin room", async () => {
  const org: StaffOrganizationMembership = {
    id: "org-single",
    name: "Happy Paws",
    slug: "happy-paws",
    role: "admin",
  };
  const { activated, deps } = createMockDeps([org]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    "/staff/organizations",
    deps,
  );

  assert.equal(destination, "/happy-paws/admin");
  assert.deepEqual(activated, ["org-single"]);
});

test("multiple-organization staff retain the organization picker without activating any org", async () => {
  const orgs: StaffOrganizationMembership[] = [
    { id: "org-1", name: "Happy Paws", slug: "happy-paws", role: "owner" },
    { id: "org-2", name: "City Hounds", slug: "city-hounds", role: "member" },
  ];
  const { activated, deps } = createMockDeps(orgs);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    undefined,
    deps,
  );

  assert.equal(destination, "/staff/organizations");
  assert.deepEqual(activated, []);
});

test("staff with zero organizations retain the existing onboarding / organization picker", async () => {
  const { activated, deps } = createMockDeps([]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    undefined,
    deps,
  );

  assert.equal(destination, "/staff/organizations");
  assert.deepEqual(activated, []);
});

test("volunteer-only members are excluded from default staff selection and retain the organization picker", async () => {
  const { activated, deps } = createMockDeps([
    {
      id: "org-volunteer",
      name: "Happy Paws",
      slug: "happy-paws",
      role: "volunteer",
    },
  ]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-volunteer",
    undefined,
    deps,
  );

  assert.equal(destination, "/staff/organizations");
  assert.deepEqual(activated, []);
});

test("explicit volunteer return flows activate an authorized volunteer membership", async () => {
  const { activated, deps } = createMockDeps([
    {
      id: "org-volunteer",
      name: "Happy Paws",
      slug: "happy-paws",
      role: "volunteer",
    },
  ]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-volunteer",
    "/happy-paws/volunteer",
    deps,
  );

  assert.equal(destination, "/happy-paws/volunteer");
  assert.deepEqual(activated, ["org-volunteer"]);
});

test("volunteer-only memberships cannot use explicit admin return flows", async () => {
  const { activated, deps } = createMockDeps([
    {
      id: "org-volunteer",
      name: "Happy Paws",
      slug: "happy-paws",
      role: "volunteer",
    },
  ]);

  const destination = await resolveStaffSignInDestination(
    new Headers(),
    "user-volunteer",
    "/happy-paws/admin",
    deps,
  );

  assert.equal(destination, "/staff/organizations");
  assert.deepEqual(activated, []);
});

test("active-organization selection activates the requested authorized organization when explicit", async () => {
  const orgs: StaffOrganizationMembership[] = [
    { id: "org-1", name: "Happy Paws", slug: "happy-paws", role: "owner" },
    { id: "org-2", name: "City Hounds", slug: "city-hounds", role: "admin" },
  ];
  const { activated, deps } = createMockDeps(orgs);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    "/city-hounds/admin/settings",
    deps,
  );

  assert.equal(destination, "/city-hounds/admin/settings");
  assert.deepEqual(activated, ["org-2"]);
});

test("explicit next destinations preserve safe non-organization return flows", async () => {
  const org: StaffOrganizationMembership = {
    id: "org-1",
    name: "Happy Paws",
    slug: "happy-paws",
    role: "owner",
  };
  const { activated, deps } = createMockDeps([org]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    "/staff/invitations/invite-uuid-1234",
    deps,
  );

  assert.equal(destination, "/staff/invitations/invite-uuid-1234");
  assert.deepEqual(activated, []);
});

test("unauthorized destinations fall back to default behavior without causing redirect loops", async () => {
  const org: StaffOrganizationMembership = {
    id: "org-single",
    name: "Happy Paws",
    slug: "happy-paws",
    role: "owner",
  };
  const { activated, deps } = createMockDeps([org]);
  const headers = new Headers();

  // User only belongs to happy-paws, but next requests unauthorized-rescue
  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    "/unauthorized-rescue/admin",
    deps,
  );

  // Instead of redirecting to the unauthorized room (which bounces back),
  // it safely routes the single-org user directly to their own staff room!
  assert.equal(destination, "/happy-paws/admin");
  assert.deepEqual(activated, ["org-single"]);
});

test("invalid or unsafe destinations fall back to default behavior", async () => {
  const org: StaffOrganizationMembership = {
    id: "org-single",
    name: "Happy Paws",
    slug: "happy-paws",
    role: "owner",
  };
  const { activated, deps } = createMockDeps([org]);
  const headers = new Headers();

  const destination = await resolveStaffSignInDestination(
    headers,
    "user-1",
    "https://attacker.com/malicious",
    deps,
  );

  assert.equal(destination, "/happy-paws/admin");
  assert.deepEqual(activated, ["org-single"]);
});

test("existing authenticated sessions follow the same destination resolution and activation", async () => {
  const singleOrg: StaffOrganizationMembership = {
    id: "org-single",
    name: "Happy Paws",
    slug: "happy-paws",
    role: "owner",
  };
  const { activated, deps } = createMockDeps([singleOrg]);
  const headers = new Headers();

  // Visiting /staff/sign-in while already authenticated
  const destination = await resolveStaffSignInDestination(
    headers,
    "user-existing-session",
    undefined,
    deps,
  );

  assert.equal(destination, "/happy-paws/admin");
  assert.deepEqual(activated, ["org-single"]);
});
