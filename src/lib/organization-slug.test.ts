import assert from "node:assert/strict";
import test from "node:test";

import { organizationSlug, organizationSlugWhileTyping } from "./organization-slug";

test("organizationSlug normalizes punctuation and casing", () => {
  assert.equal(organizationSlug("Coppers Dream Rescue!"), "coppers-dream-rescue");
});

test("organizationSlug collapses invalid character runs", () => {
  assert.equal(organizationSlug("Happy___Tails---Rescue"), "happy-tails-rescue");
});

test("organizationSlug trims leading and trailing dashes", () => {
  assert.equal(organizationSlug("---Second Chance---"), "second-chance");
});

test("organizationSlug returns an empty slug when no supported characters remain", () => {
  assert.equal(organizationSlug("!!! 🐕 犬"), "");
});

test("organizationSlugWhileTyping keeps a dash the user just typed", () => {
  assert.equal(organizationSlugWhileTyping("Happy-"), "happy-");
  assert.equal(organizationSlugWhileTyping("happy-tails"), "happy-tails");
});

test("organizationSlugWhileTyping still collapses and trims leading noise", () => {
  assert.equal(organizationSlugWhileTyping("---Happy___"), "happy-");
  assert.equal(organizationSlugWhileTyping("!!!"), "");
});
