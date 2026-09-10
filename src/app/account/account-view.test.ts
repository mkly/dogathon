import assert from "node:assert/strict";
import test from "node:test";

import { sponsorshipAccountActions } from "./account-view.ts";

test("active and awaiting sponsorships keep their organization-specific switch links", () => {
  for (const status of ["active", "awaiting"]) {
    assert.deepEqual(
      sponsorshipAccountActions({
        id: "sponsorship-id",
        organizationSlug: "long-live-paws",
        status,
        stripeCustomerId: null,
      }),
      {
        billingPortal: false,
        switchCompanionsHref:
          "/long-live-paws/sponsor/next?sponsorship=sponsorship-id",
      },
    );
  }
});

test("billing remains available independently of companion switching", () => {
  assert.deepEqual(
    sponsorshipAccountActions({
      id: "ended-id",
      organizationSlug: "paws-and-claws",
      status: "ended",
      stripeCustomerId: "customer-id",
    }),
    {
      billingPortal: true,
      switchCompanionsHref: null,
    },
  );
});
