import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  extractScrapedText,
  graduationDraft,
  loadRoster,
  loadRosterSource,
} from "./roster-sync.ts";

test("loads a checked-in roster path without requiring the network", async () => {
  const expected = await readFile(new URL("../../seed/dogs-page-A.html", import.meta.url), "utf8");

  assert.equal(await loadRosterSource("seed/dogs-page-A.html"), expected);
});

test("extracts nested Arcade content but rejects dry-run calls", () => {
  const cleanedHtml = "<h3>Hattie</h3>";
  const rawHtml = "<!doctype html><h3>Walnut</h3>";

  assert.equal(extractScrapedText({ output: { data: { html: cleanedHtml } } }), cleanedHtml);
  assert.equal(extractScrapedText({ data: { rawHtml } }), rawHtml);
  assert.equal(extractScrapedText({ output: { value: "# roster" } }), "# roster");
  assert.equal(extractScrapedText({ dryRun: true, input: { url: "https://example.test" } }), null);
});

test("graduation drafts are queued and sponsor-specific", () => {
  const draft = graduationDraft("dog-1", "Hattie", "Sam");

  assert.equal(draft.type, "graduation");
  assert.equal(draft.status, "draft");
  assert.match(draft.bodyText, /Sam/);
  assert.match(draft.bodyText, /sponsorship has ended/i);
});

test("a configured local capture is the real source, not a scrape fallback", async () => {
  const roster = await loadRoster("seed/dogs-page-A.html");

  assert.equal(roster.usedFallbackCapture, false);
  assert.equal(roster.source, "seed/dogs-page-A.html");
  assert.match(roster.text, /Hattie/);
});

test("an unreachable remote source is flagged as a fallback capture", async () => {
  const roster = await loadRoster("https://example.test/dogs-and-more");

  assert.equal(roster.usedFallbackCapture, true);
  assert.equal(roster.source, "seed/dogs-page-A.html");
  assert.match(roster.text, /Walnut/);
});
