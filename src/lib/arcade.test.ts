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
import { POST as authorizeGmail } from "../app/api/arcade/gmail/authorize/route.ts";
import { GET as getGmailStatus } from "../app/api/arcade/gmail/status/route.ts";
import { auth } from "./auth.ts";
import { prisma } from "./prisma.ts";

/** The Gmail routes are staff-only, so exercising them needs a signed-in call. */
function staffRequest() {
  return new Request("http://localhost:3000/api/arcade/gmail", { method: "POST" });
}

function stubStaffSession() {
  const restore = auth.api.getSession;
  const restoreMembership = prisma.member.findUnique;
  auth.api.getSession = (async () => ({
    session: { id: "test-session", activeOrganizationId: "test-org" },
    user: { id: "test-staff", email: "staff@example.com" },
  })) as typeof auth.api.getSession;
  prisma.member.findUnique = (async () => ({
    organizationId: "test-org",
    role: "admin",
    userId: "test-staff",
  })) as unknown as typeof prisma.member.findUnique;
  return () => {
    auth.api.getSession = restore;
    prisma.member.findUnique = restoreMembership;
  };
}

test("Gmail routes reject callers without an active organization membership", async () => {
  const authorizeResponse = await authorizeGmail(staffRequest());
  assert.equal(authorizeResponse.status, 403);

  const statusResponse = await getGmailStatus(staffRequest());
  assert.equal(statusResponse.status, 403);
});

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
          operation: "status",
          toolName: "Gmail.SendEmail",
          userId: "volunteer@example.com",
        },
      ],
    );

    const status = calls[4] as Awaited<ReturnType<typeof gmailAuthStatus>>;
    assert.equal(status.authorized, false);
    assert.equal(status.status, "not_configured");
    assert.equal(status.url, null);

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

test("Gmail routes handle missing Arcade configuration", async () => {
  const previousApiKey = process.env.ARCADE_API_KEY;
  const previousUserId = process.env.ARCADE_USER_ID;
  const restoreSession = stubStaffSession();

  try {
    delete process.env.ARCADE_API_KEY;
    delete process.env.ARCADE_USER_ID;

    const authorizeResponse = await authorizeGmail(staffRequest());
    assert.equal(authorizeResponse.status, 503);
    assert.deepEqual(await authorizeResponse.json(), {
      error: "Gmail connection is not configured: ARCADE_API_KEY is missing",
    });

    const statusResponse = await getGmailStatus(staffRequest());
    assert.equal(statusResponse.status, 200);
    assert.deepEqual(await statusResponse.json(), {
      connected: false,
      status: "not_configured",
    });

    process.env.ARCADE_API_KEY = "configured-key";

    const missingUserAuthorizeResponse = await authorizeGmail(staffRequest());
    assert.equal(missingUserAuthorizeResponse.status, 503);
    assert.deepEqual(await missingUserAuthorizeResponse.json(), {
      error: "ARCADE_USER_ID is required when ARCADE_API_KEY is configured",
    });

    const missingUserStatusResponse = await getGmailStatus(staffRequest());
    assert.equal(missingUserStatusResponse.status, 503);
    assert.deepEqual(await missingUserStatusResponse.json(), {
      connected: false,
      error: "ARCADE_USER_ID is required when ARCADE_API_KEY is configured",
    });
  } finally {
    restoreSession();
    if (previousApiKey === undefined) delete process.env.ARCADE_API_KEY;
    else process.env.ARCADE_API_KEY = previousApiKey;

    if (previousUserId === undefined) delete process.env.ARCADE_USER_ID;
    else process.env.ARCADE_USER_ID = previousUserId;
  }
});
