import assert from "node:assert/strict";
import test from "node:test";

import {
  staffOrganizationsPath,
  staffOrganizationsSignInPath,
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
