import assert from "node:assert/strict";
import test from "node:test";

import {
  gmailAuthorizeUrl,
  gmailAuthStatus,
  scrapeUrl,
  sendEmail,
  sendSms,
} from "./arcade.ts";
import type { DryRunCall } from "./arcade.ts";

function isDryRunCall(value: unknown): value is DryRunCall {
  return (
    typeof value === "object" &&
    value !== null &&
    "dryRun" in value &&
    value.dryRun === true
  );
}

test("all Arcade helpers return structured calls without credentials", async () => {
  const previousApiKey = process.env.ARCADE_API_KEY;
  const previousUserId = process.env.ARCADE_USER_ID;
  delete process.env.ARCADE_API_KEY;
  delete process.env.ARCADE_USER_ID;

  try {
    const calls = await Promise.all([
      scrapeUrl("https://example.com/dogs"),
      sendEmail({
        to: "sponsor@example.com",
        subject: "Sirius update",
        body: "Sirius had a great walk today.",
      }),
      sendSms({ to: "+15551234567", body: "Sirius has a new pupdate!" }),
      gmailAuthorizeUrl("volunteer@example.com"),
      gmailAuthStatus("volunteer@example.com"),
    ]);

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
      [
        {
          dryRun: true,
          operation: "execute",
          toolName: "Firecrawl.ScrapeUrl",
          userId: "dry-run-user",
        },
        {
          dryRun: true,
          operation: "execute",
          toolName: "Gmail.SendEmail",
          userId: "dry-run-user",
        },
        {
          dryRun: true,
          operation: "execute",
          toolName: "Twilio.SendSms",
          userId: "dry-run-user",
        },
        {
          dryRun: true,
          operation: "authorize",
          toolName: "Gmail.SendEmail",
          userId: "volunteer@example.com",
        },
        {
          dryRun: true,
          operation: "authorize",
          toolName: "Gmail.SendEmail",
          userId: "volunteer@example.com",
        },
      ],
    );
  } finally {
    if (previousApiKey === undefined) delete process.env.ARCADE_API_KEY;
    else process.env.ARCADE_API_KEY = previousApiKey;

    if (previousUserId === undefined) delete process.env.ARCADE_USER_ID;
    else process.env.ARCADE_USER_ID = previousUserId;
  }
});
