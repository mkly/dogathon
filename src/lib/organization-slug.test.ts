import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { reservedSlugs } from "reserved-slugs";

import {
  isReservedOrganizationSlug,
  organizationSlug,
  organizationSlugWhileTyping,
  reservedOrganizationSlugMessage,
} from "./organization-slug";

test("organizationSlug normalizes punctuation and casing", () => {
  assert.equal(organizationSlug("Maple Street Rescue!"), "maple-street-rescue");
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

test("isReservedOrganizationSlug rejects every application route and public directory", () => {
  const applicationSlugs = readdirSync(path.join(process.cwd(), "src/app"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("(") && name !== "[orgSlug]");
  const publicSlugs = readdirSync(path.join(process.cwd(), "public"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const slug of [...applicationSlugs, ...publicSlugs]) {
    assert.equal(isReservedOrganizationSlug(slug), true, slug);
  }
});

test("isReservedOrganizationSlug rejects every slug from reserved-slugs", () => {
  for (const slug of reservedSlugs) {
    assert.equal(isReservedOrganizationSlug(slug), true, slug);
  }
});

test("isReservedOrganizationSlug normalizes input and accepts rescue slugs", () => {
  assert.equal(isReservedOrganizationSlug("STAFF"), true);
  assert.equal(isReservedOrganizationSlug("next"), true);
  assert.equal(isReservedOrganizationSlug("Sign In"), true);
  for (const slug of ["happy-tails-rescue", "paws", "shelter", "humane"]) {
    assert.equal(isReservedOrganizationSlug(slug), false, slug);
  }
});

test("reserved organization slug errors name the rejected slug and suggest an alternative", () => {
  assert.equal(
    reservedOrganizationSlugMessage("support"),
    "The URL /support is reserved because it is used or may be needed by Dogathon itself (routes like /support, /login, /api). Pick a different slug, for example support-rescue.",
  );
});

test("reserved organization slug errors name a submittable slug for unnormalized input", () => {
  assert.equal(
    reservedOrganizationSlugMessage("Sign In"),
    "The URL /sign-in is reserved because it is used or may be needed by Dogathon itself (routes like /support, /login, /api). Pick a different slug, for example sign-in-rescue.",
  );
});
