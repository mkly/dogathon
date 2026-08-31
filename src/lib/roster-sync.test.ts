import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertPlausibleAdoptionCount,
  discoverRoster,
  extractScrapedText,
  graduationDraft,
  loadRoster,
  loadRosterSource,
  requestFirecrawl,
  RosterSyncRefusal,
} from "./roster-sync.ts";

test("loads a checked-in roster path without requiring the network", async () => {
  const expected = await readFile(new URL("../../seed/dogs-page-A.html", import.meta.url), "utf8");

  assert.equal(await loadRosterSource("seed/dogs-page-A.html"), expected);
});

test("extracts nested scrape content but rejects dry-run calls", () => {
  const cleanedHtml = "<h3>Hattie</h3>";
  const rawHtml = "<!doctype html><h3>Walnut</h3>";

  assert.equal(extractScrapedText({ output: { data: { html: cleanedHtml } } }), cleanedHtml);
  assert.equal(extractScrapedText({ data: { rawHtml } }), rawHtml);
  assert.equal(extractScrapedText({ output: { value: "# roster" } }), "# roster");
  assert.equal(extractScrapedText({ dryRun: true, input: { url: "https://example.test" } }), null);
});

test("a bounded model loop maps the rescue site and scrapes the selected roster", async () => {
  const modelSteps: string[][] = [];
  const firecrawlCalls: Array<{ name: string; input: Record<string, unknown> }> = [];
  let step = 0;
  const text = await discoverRoster("https://rescue.example/landing", {
    model: async (messages, tools) => {
      modelSteps.push(messages.map((message) => message.role));
      assert.deepEqual(tools.map((tool) => tool.function.name), [
        "firecrawl_map",
        "firecrawl_scrape",
      ]);
      step += 1;
      if (step === 1) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "map-1",
            type: "function",
            function: {
              name: "firecrawl_map",
              arguments: JSON.stringify({ url: "https://rescue.example", search: "adoptable dogs" }),
            },
          }],
        };
      }
      if (step === 2) {
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "scrape-1",
            type: "function",
            function: {
              name: "firecrawl_scrape",
              arguments: JSON.stringify({ url: "https://rescue.example/adopt/dogs" }),
            },
          }],
        };
      }
      return { role: "assistant", content: "The roster is ready." };
    },
    firecrawl: async (name, input) => {
      firecrawlCalls.push({ name, input });
      return name === "firecrawl_map"
        ? { success: true, links: [{ url: "https://rescue.example/adopt/dogs" }] }
        : { success: true, data: { markdown: "# Hattie\nBreed: Mixed" } };
    },
  });

  assert.equal(text, "# Hattie\nBreed: Mixed");
  assert.deepEqual(firecrawlCalls.map((call) => call.name), [
    "firecrawl_map",
    "firecrawl_scrape",
  ]);
  assert.deepEqual(modelSteps.map((messages) => messages.at(-1)), ["user", "tool", "tool"]);
});

test("calls the direct Firecrawl v2 endpoints with bearer authentication", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ success: true, data: { markdown: "# Roster" } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await requestFirecrawl(
    "firecrawl_scrape",
    { url: "https://rescue.example/dogs" },
    { apiKey: "fc-test", baseUrl: "https://firecrawl.example/v2/", fetch: fetcher },
  );

  assert.equal(requests[0]?.url, "https://firecrawl.example/v2/scrape");
  assert.equal((requests[0]?.init?.headers as Record<string, string>).authorization, "Bearer fc-test");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    url: "https://rescue.example/dogs",
    formats: ["markdown"],
    onlyMainContent: true,
  });
});

test("stops roster discovery after four model steps", async () => {
  let modelCalls = 0;

  await assert.rejects(
    discoverRoster("https://rescue.example/dogs", {
      model: async () => {
        modelCalls += 1;
        return {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: `map-${modelCalls}`,
            type: "function",
            function: {
              name: "firecrawl_map",
              arguments: JSON.stringify({ url: "https://rescue.example/dogs" }),
            },
          }],
        };
      },
      firecrawl: async () => ({ success: true, links: [] }),
    }),
    /without scraping roster content/,
  );

  assert.equal(modelCalls, 4);
});

test("graduation drafts are queued and sponsor-specific", () => {
  const draft = graduationDraft("dog-1", "Hattie", "Sam");

  assert.equal(draft.type, "graduation");
  assert.equal(draft.status, "draft");
  assert.match(draft.bodyText, /Sam/);
  assert.match(draft.bodyText, /sponsorship has ended/i);
});

test("refuses a live sync that would adopt most available residents", () => {
  assert.throws(
    () => assertPlausibleAdoptionCount(10, 6, false),
    (error) => error instanceof RosterSyncRefusal
      && /adopt 6 of 10 available residents/.test(error.reason),
  );
});

test("allows a plausible live adoption count", () => {
  assert.doesNotThrow(() => assertPlausibleAdoptionCount(10, 2, false));
});

test("preserves explicit adoption handling for fallback captures", () => {
  assert.doesNotThrow(() => assertPlausibleAdoptionCount(10, 10, true));
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
