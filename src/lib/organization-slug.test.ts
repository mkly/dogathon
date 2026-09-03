import assert from "node:assert/strict";
import test from "node:test";

import {
  isReservedOrganizationSlug,
  organizationSlug,
  organizationSlugWhileTyping,
} from "./organization-slug";

test("organizationSlug normalizes punctuation and casing", () => {
  assert.equal(organizationSlug("Coppers Dream Rescue!"), "coppers-dream-rescue");
});

test("organizationSlug applies slugify's strict character rules", () => {
  assert.equal(organizationSlug("Happy___Tails---Rescue"), "happytails-rescue");
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

test("isReservedOrganizationSlug rejects application route names", () => {
  for (const slug of [
    "api",
    "staff",
    "account",
    "sign-in",
    "organizations",
    "felt",
    "admin",
    "_next",
  ]) {
    assert.equal(isReservedOrganizationSlug(slug), true, slug);
  }
});

test("isReservedOrganizationSlug rejects every top-level public directory", () => {
  for (const slug of ["brand", "mascot", "textures", "uploads"]) {
    assert.equal(isReservedOrganizationSlug(slug), true, slug);
  }
});

test("isReservedOrganizationSlug normalizes input and accepts rescue slugs", () => {
  assert.equal(isReservedOrganizationSlug("STAFF"), true);
  assert.equal(isReservedOrganizationSlug("next"), true);
  assert.equal(isReservedOrganizationSlug("Sign In"), true);
  assert.equal(isReservedOrganizationSlug("happy-tails"), false);
  assert.equal(isReservedOrganizationSlug("coppers-dream"), false);
});
