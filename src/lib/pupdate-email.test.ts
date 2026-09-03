import assert from "node:assert/strict";
import test from "node:test";

import { renderPupdateEmail } from "./pupdate-email.ts";

const base = {
  companionName: "Biscuit",
  subject: "A pupdate from Biscuit",
  bodyText: "Here is the latest.\n\nRecent notes:\n- Took a treat from a stranger.\n- Slept through the night.\n\nThank you.",
  companionUrl: "https://pawcast.test/companions/abc",
  origin: "https://pawcast.test",
  photoUrl: "/uploads/biscuit.jpg",
} as const;

test("turns composer prose into a heading, a list, and paragraphs", () => {
  const html = renderPupdateEmail(base);

  assert.match(html, /<ul[^>]*>/u);
  assert.equal((html.match(/<li /gu) ?? []).length, 2);
  assert.match(html, /Took a treat from a stranger\./u);
  // the "- " markers are consumed by the list, never printed
  assert.ok(!html.includes("- Took a treat"));
  assert.match(html, /RECENT NOTES|Recent notes/iu);
});

test("resolves every asset and link to an absolute URL", () => {
  const html = renderPupdateEmail(base);

  assert.match(html, /https:\/\/pawcast\.test\/uploads\/biscuit\.jpg/u);
  assert.match(html, /https:\/\/pawcast\.test\/brand\/pawcast-wordmark\.png/u);
  assert.match(html, /https:\/\/pawcast\.test\/textures\/email\/ground\.jpg/u);
  assert.match(html, /href="https:\/\/pawcast\.test\/companions\/abc"/u);
});

test("omits the photo block when the resident has no photo", () => {
  const html = renderPupdateEmail({ ...base, photoUrl: null });

  assert.ok(!html.includes("/uploads/"));
  assert.match(html, /A pupdate from Biscuit/u);
});

test("escapes sponsor-facing copy instead of injecting it as markup", () => {
  const html = renderPupdateEmail({
    ...base,
    companionName: "Biscuit <script>",
    bodyText: "A note with <b>tags</b> & an ampersand.",
  });

  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;b&gt;tags&lt;\/b&gt; &amp; an ampersand/u);
});

test("switches the hero to the mustard adoption-day treatment", () => {
  const regular = renderPupdateEmail(base);
  const graduation = renderPupdateEmail({ ...base, type: "graduation" });

  assert.match(regular, /A new pupdate/u);
  assert.match(regular, /felt-moss\.jpg/u);
  assert.match(graduation, /Adoption day/u);
  assert.match(graduation, /felt-mustard\.jpg/u);
});
