import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSourceUrl } from "./source-url.ts";

test("normalizes a public page URL without tracking data", () => {
  assert.equal(
    normalizeSourceUrl(
      "HTTPS://Example.COM:443/dogs/Biscuit///?keep=yes&utm_source=mail&fbclid=abc#bio",
    ),
    "https://example.com/dogs/Biscuit?keep=yes",
  );
  assert.equal(
    normalizeSourceUrl("http://EXAMPLE.com:80/dogs/"),
    "http://example.com/dogs",
  );
  assert.equal(
    normalizeSourceUrl("https://EXAMPLE.com:443/"),
    "https://example.com",
  );
});

test("source URL normalization is idempotent and rejects non-web URLs", () => {
  const normalized = normalizeSourceUrl(
    "https://example.com/dogs/?gclid=x&ref=friend",
  );
  assert.equal(normalizeSourceUrl(normalized), normalized);
  assert.equal(normalizeSourceUrl("mailto:rescue@example.com"), "");
});
