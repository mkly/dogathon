import assert from "node:assert/strict";
import test from "node:test";

import { render } from "@react-email/render";
import { createElement } from "react";

import {
  SponsorUpdateEmail,
  sponsorUpdateEmailSubject,
} from "../emails/sponsor-update-email.tsx";

const base = {
  rescueName: "Huffy Puff Rescue",
  companionName: "Biscuit",
  updateSubject: "Biscuit discovered the sprinkler",
  teaser: "Biscuit had a brave, splashy afternoon with the volunteers.",
  updatePageUrl: "https://pawcast.test/huffy-puff/updates/abc",
  photoUrl: "https://images.test/biscuit.jpg",
} as const;

test("uses a type-specific delivery subject", () => {
  assert.equal(sponsorUpdateEmailSubject("Biscuit"), "Biscuit has a new update");
  assert.equal(sponsorUpdateEmailSubject("Biscuit", "graduation"), "Biscuit has been adopted");
});

test("renders a minimal regular update notice", async () => {
  const html = await render(createElement(SponsorUpdateEmail, base));

  assert.match(html, /Huffy Puff Rescue/u);
  assert.match(html, /Biscuit discovered the sprinkler/u);
  assert.match(html, /Biscuit had a brave, splashy afternoon/u);
  assert.match(html, /Read the update/u);
  assert.match(html, /href="https:\/\/pawcast\.test\/huffy-puff\/updates\/abc"/u);
  assert.equal((html.match(/<img(?:\s|>)/gu) ?? []).length, 1);
  assert.ok(!html.includes("felt"));
  assert.ok(!html.includes("stitch"));
});

test("does not include the full update body", async () => {
  const html = await render(createElement(SponsorUpdateEmail, base));

  assert.ok(!html.includes("Recent notes"));
  assert.ok(!html.includes("monthly"));
});

test("omits the hero cleanly when there is no photo", async () => {
  const html = await render(createElement(SponsorUpdateEmail, { ...base, photoUrl: null }));

  assert.equal((html.match(/<img(?:\s|>)/gu) ?? []).length, 0);
  assert.match(html, /Biscuit discovered the sprinkler/u);
});

test("renders the graduation story and sponsorship choices", async () => {
  const html = await render(createElement(SponsorUpdateEmail, {
    ...base,
    type: "graduation",
    sponsorshipSelectionUrl: "https://pawcast.test/huffy-puff/sponsor/choose",
  }));

  assert.match(html, /Biscuit has been adopted/u);
  assert.match(html, /Biscuit discovered the sprinkler/u);
  assert.match(html, /Read Biscuit(?:&#x27;|')s story/u);
  assert.match(html, /Your sponsorship can continue with another companion/u);
  assert.match(html, /Choose a new companion/u);
  assert.match(html, /href="https:\/\/pawcast\.test\/huffy-puff\/sponsor\/choose"/u);
  assert.ok(!html.includes("25.00"));
  assert.ok(!html.includes("only sponsor"));
});
