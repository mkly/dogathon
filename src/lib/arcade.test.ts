import assert from "node:assert/strict";
import test from "node:test";

import { scrapeUrl } from "./arcade.ts";
import type { DryRunCall } from "./arcade.ts";

function isDryRunCall(value: unknown): value is DryRunCall {
  return (
    typeof value === "object" &&
    value !== null &&
    "dryRun" in value &&
    value.dryRun === true
  );
}

test("the remaining Arcade scrape helper returns a structured call without credentials", async () => {
  const previousApiKey = process.env.ARCADE_API_KEY;
  const previousUserId = process.env.ARCADE_USER_ID;
  delete process.env.ARCADE_API_KEY;
  delete process.env.ARCADE_USER_ID;

  try {
    const calls = await Promise.all([scrapeUrl("https://example.com/dogs")]);

    const dryRuns = calls.map((call) => {
      assert.ok(isDryRunCall(call));
      return {
        dryRun: call.dryRun,
        operation: call.operation,
        toolName: call.toolName,
        userId: call.userId,
      };
    });

    assert.deepEqual(
      dryRuns,
      [{ dryRun: true, operation: "execute", toolName: "Firecrawl.ScrapeUrl", userId: "dry-run-user" }],
    );

    const scrape = calls[0] as DryRunCall;
    assert.deepEqual(scrape.input, {
      url: "https://example.com/dogs",
      formats: ["html"],
    });
  } finally {
    if (previousApiKey === undefined) delete process.env.ARCADE_API_KEY;
    else process.env.ARCADE_API_KEY = previousApiKey;

    if (previousUserId === undefined) delete process.env.ARCADE_USER_ID;
    else process.env.ARCADE_USER_ID = previousUserId;
  }
});
