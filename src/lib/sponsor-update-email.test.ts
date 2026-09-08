import assert from "node:assert/strict";
import test from "node:test";

import { render } from "@react-email/render";
import { createElement } from "react";

import { SponsorUpdateEmail } from "../emails/sponsor-update-email.tsx";

const base = {
  companionName: "Biscuit",
  subject: "An update from Biscuit",
  bodyText: "Here is the latest.\n\n## Recent notes\n\n- Took a treat from a stranger.\n- Slept through the night.\n\nThank you.",
  companionUrl: "https://pawcast.test/companions/abc",
  monthlyCents: 3250,
  origin: "https://pawcast.test",
  photoUrl: "/uploads/biscuit.jpg",
} as const;

test("renders representative Markdown as themed HTML and plain text", async () => {
  const email = createElement(SponsorUpdateEmail, base);
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
  const html = await render(createElement(SponsorUpdateEmail, base));

  assert.match(html, /https:\/\/pawcast\.test\/uploads\/biscuit\.jpg/u);
  assert.match(html, /https:\/\/pawcast\.test\/brand\/pawcast-wordmark\.png/u);
  assert.match(html, /https:\/\/pawcast\.test\/textures\/email\/ground\.jpg/u);
  assert.match(html, /href="https:\/\/pawcast\.test\/companions\/abc"/u);
});

test("omits the photo block when the resident has no photo", async () => {
  const html = await render(createElement(SponsorUpdateEmail, { ...base, photoUrl: null }));

  assert.ok(!html.includes("/uploads/"));
  assert.match(html, /An update from Biscuit/u);
});

test("escapes sponsor-facing copy instead of injecting it as markup", async () => {
  const html = await render(createElement(SponsorUpdateEmail, {
    ...base,
    companionName: "Biscuit <script>",
    bodyText: "A note with <b>tags</b> & an ampersand.",
  }));

  assert.ok(!html.includes("<script>"));
  assert.match(html, /&lt;b&gt;tags&lt;\/b&gt; &amp; an ampersand/u);
});

test("switches the hero to the mustard farewell treatment", async () => {
  const regular = await render(createElement(SponsorUpdateEmail, base));
  const graduation = await render(createElement(SponsorUpdateEmail, { ...base, type: "graduation" }));

  assert.match(regular, /A new update/u);
  assert.match(regular, /felt-moss\.jpg/u);
  assert.match(graduation, /A farewell/u);
  assert.match(graduation, /felt-mustard\.jpg/u);
});

test("neutralizes unsafe markdown link destinations", async () => {
  const html = await render(createElement(SponsorUpdateEmail, {
    ...base,
    bodyText: "[click](javascript:alert(1)) and [safe](https://pawcast.test/x)",
  }));

  assert.ok(!html.includes("javascript:"));
  assert.match(html, /href="https:\/\/pawcast\.test\/x"/u);
});

test("renders a Markdown postscript in HTML and plain text", async () => {
  const postscript = "**Bold thanks**\n\n[Learn more](https://example.org)\n\n- First\n- Second";
  const email = createElement(SponsorUpdateEmail, { ...base, bodyText: `${base.bodyText}\n\n${postscript}` });
  const [html, plainText] = await Promise.all([render(email), render(email, { plainText: true })]);

  assert.match(html, /<strong[^>]*>Bold thanks<\/strong>/u);
  assert.match(html, /href="https:\/\/example\.org"/u);
  assert.match(html, /<li(?:\s|>)/u);
  assert.match(plainText, /Bold thanks/u);
  assert.match(plainText, /Learn more[\s\S]*https:\/\/example\.org/u);
  assert.ok(!plainText.includes("**Bold thanks**"));
});
