import assert from "node:assert/strict";
import test from "node:test";

import { render } from "@react-email/render";
import { createElement } from "react";

import { PupdateEmail } from "../emails/pupdate-email.tsx";

const base = {
  companionName: "Biscuit",
  subject: "A pupdate from Biscuit",
  bodyText: "Here is the latest.\n\n## Recent notes\n\n- Took a treat from a stranger.\n- Slept through the night.\n\nThank you.",
  companionUrl: "https://pawcast.test/companions/abc",
  origin: "https://pawcast.test",
  photoUrl: "/uploads/biscuit.jpg",
} as const;

test("renders representative Markdown as themed HTML and plain text", async () => {
  const email = createElement(PupdateEmail, base);
  const [html, plainText] = await Promise.all([
    render(email),
    render(email, { plainText: true }),
  ]);

  assert.match(html, /<ul[^>]*>/u);
  assert.equal((html.match(/<li(?:\s|>)/gu) ?? []).length, 2);
  assert.match(html, /Took a treat from a stranger\./u);
  // the "- " markers are consumed by the list, never printed
  assert.ok(!html.includes("- Took a treat"));
  assert.match(html, /RECENT NOTES|Recent notes/iu);
  assert.match(plainText, /RECENT NOTES/iu);
  assert.match(plainText, /\* Took a treat from a stranger\./u);
});

test("resolves every asset and link to an absolute URL", async () => {
  const html = await render(createElement(PupdateEmail, base));

  assert.match(html, /https:\/\/pawcast\.test\/uploads\/biscuit\.jpg/u);
  assert.match(html, /https:\/\/pawcast\.test\/brand\/pawcast-wordmark\.png/u);
  assert.match(html, /https:\/\/pawcast\.test\/textures\/email\/ground\.jpg/u);
  assert.match(html, /href="https:\/\/pawcast\.test\/companions\/abc"/u);
});

test("omits the photo block when the resident has no photo", async () => {
  const html = await render(createElement(PupdateEmail, { ...base, photoUrl: null }));

  assert.ok(!html.includes("/uploads/"));
  assert.match(html, /A pupdate from Biscuit/u);
});

test("escapes sponsor-facing copy instead of injecting it as markup", async () => {
  const html = await render(createElement(PupdateEmail, {
    ...base,
    companionName: "Biscuit <script>",
    bodyText: "A note with <b>tags</b> & an ampersand.",
  }));

  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;b&gt;tags&lt;\/b&gt; &amp; an ampersand/u);
});

test("switches the hero to the mustard adoption-day treatment", async () => {
  const regular = await render(createElement(PupdateEmail, base));
  const graduation = await render(createElement(PupdateEmail, { ...base, type: "graduation" }));

  assert.match(regular, /A new pupdate/u);
  assert.match(regular, /felt-moss\.jpg/u);
  assert.match(graduation, /Adoption day/u);
  assert.match(graduation, /felt-mustard\.jpg/u);
});

test("neutralizes unsafe markdown link destinations", async () => {
  const html = await render(createElement(PupdateEmail, {
    ...base,
    bodyText: "[click](javascript:alert(1)) and [safe](https://pawcast.test/x)",
  }));

  assert.ok(!html.includes("javascript:"));
  assert.match(html, /href="https:\/\/pawcast\.test\/x"/u);
});
