import assert from "node:assert/strict";
import test from "node:test";

import {
  companionFacts,
  isCheckoutReturn,
  sponsorshipSucceeded,
} from "../app/[orgSlug]/(public)/companions/[id]/companion-page.ts";

test("successful sponsorship queries hide the sponsor form", () => {
  assert.equal(sponsorshipSucceeded({ sponsored: "1" }), true);
  assert.equal(sponsorshipSucceeded({}), false);
  assert.equal(sponsorshipSucceeded({ sponsored: "0" }), false);
  assert.equal(sponsorshipSucceeded({ sponsored: ["1", "1"] }), true);
  assert.equal(sponsorshipSucceeded({ error: ["billing"], sponsored: "1" }), false);
  assert.equal(sponsorshipSucceeded({ error: "billing", sponsored: "1" }), false);
});

test("checkout returns keep the page reachable after the companion is sponsored", () => {
  assert.equal(isCheckoutReturn({ sponsored: "1" }), true);
  assert.equal(isCheckoutReturn({ error: "unavailable" }), true);
  assert.equal(isCheckoutReturn({ checkout: "canceled" }), true);
  assert.equal(isCheckoutReturn({}), false);
});

test("companion facts omit missing values without dangling separators", () => {
  assert.equal(
    companionFacts({ ageText: "3 years", breed: "Hound", species: "dog", sex: "Female", weightText: "42 lb" }),
    "Dog · Hound · Female · 3 years · 42 lb",
  );
  assert.equal(
    companionFacts({ ageText: null, breed: "Hound", sex: "", weightText: undefined }),
    "Hound",
  );
  assert.equal(companionFacts({}), "");
});
