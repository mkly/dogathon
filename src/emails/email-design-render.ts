import assert from "node:assert/strict";
import test from "node:test";

import { render } from "@react-email/render";

import {
  EMAIL_PREVIEW_FIXTURES,
  EMAIL_PREVIEW_WIDTHS,
} from "./email-preview-fixtures.ts";

const rendered = new Map<string, string>(
  await Promise.all(
    EMAIL_PREVIEW_FIXTURES.map(
      async (fixture) => [fixture.name, await render(fixture.element)] as const,
    ),
  ),
);

test("all HTML email variants use readable email-safe presentation", () => {
  for (const [name, html] of rendered) {
    assert.match(
      html,
      /font-family:-apple-system, BlinkMacSystemFont, &#x27;Segoe UI&#x27;, Helvetica, Arial, sans-serif/u,
      name,
    );
    assert.doesNotMatch(
      html,
      /(?:filter|text-shadow|-webkit-text-stroke|text-stroke)\s*:/iu,
      name,
    );
    assert.doesNotMatch(html, /Nunito|Inter/iu, name);
    assert.match(html, /max-width:560px/u, name);
    assert.match(html, /width:100%/u, name);
  }
});

test("buttons retain exact destinations without underlined copy", () => {
  const regular = rendered.get("regular-update-with-photo") ?? "";
  const graduation = rendered.get("graduation-without-photo") ?? "";

  assert.match(
    regular,
    /href="https:\/\/pawcast\.example\/rescue\/updates\/biscuit"/u,
  );
  assert.match(graduation, /token=preview-token/u);
  assert.match(graduation, /text-decoration:none/u);
  assert.match(graduation, /padding:14px 22px/u);
});

test("photos are prominent when available and absent-image messages stay usable", () => {
  const regular = rendered.get("regular-update-with-photo") ?? "";
  const transfer = rendered.get("sponsorship-transferred-with-photo") ?? "";
  const noPhoto = rendered.get("graduation-without-photo") ?? "";
  const ended = rendered.get("sponsorship-ended") ?? "";

  assert.match(regular, /alt="Biscuit"/u);
  assert.match(regular, /src="https:\/\/images\.example\/biscuit\.jpg"/u);
  assert.match(transfer, /alt="Mochi"/u);
  assert.match(transfer, /src="https:\/\/images\.example\/mochi\.jpg"/u);
  assert.doesNotMatch(noPhoto, /<img/iu);
  assert.doesNotMatch(ended, /<img/iu);
  assert.match(noPhoto, /Juniper has been adopted/u);
  assert.match(ended, /You will not be charged again/u);
});

test("visual fixtures cover narrow mobile and desktop widths", () => {
  assert.deepEqual(EMAIL_PREVIEW_WIDTHS, [320, 390, 600]);
  assert.equal(EMAIL_PREVIEW_FIXTURES.length, 4);

  for (const html of rendered.values()) {
    assert.match(html, /padding:24px 12px/u);
  }
});
