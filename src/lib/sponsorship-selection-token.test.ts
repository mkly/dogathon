import assert from "node:assert/strict";
import test from "node:test";

import {
  createSponsorshipSelectionToken,
  SPONSORSHIP_SELECTION_TOKEN_TTL_MS,
  sponsorshipSelectionUrl,
  verifySponsorshipSelectionToken,
} from "./sponsorship-selection-token.ts";

const sponsorshipId = "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8";
const secret = "a-test-secret-with-at-least-32-characters";
const now = new Date("2026-09-08T16:00:00Z");

test("round-trips a signed sponsorship id into the public selection URL", () => {
  const url = new URL(
    sponsorshipSelectionUrl(
      "https://pawcast.test",
      "huffy puff",
      sponsorshipId,
      secret,
      now,
    ),
  );

  assert.equal(url.pathname, "/huffy%20puff/sponsor/next");
  assert.deepEqual(
    verifySponsorshipSelectionToken(
      url.searchParams.get("token")!,
      secret,
      now,
    ),
    { sponsorshipId },
  );
});

test("rejects tampered, malformed, and expired tokens", () => {
  const token = createSponsorshipSelectionToken(sponsorshipId, secret, now);
  assert.equal(verifySponsorshipSelectionToken(`${token}x`, secret, now), null);
  assert.equal(
    verifySponsorshipSelectionToken("not-a-token", secret, now),
    null,
  );
  assert.equal(
    verifySponsorshipSelectionToken(
      token,
      secret,
      new Date(now.getTime() + SPONSORSHIP_SELECTION_TOKEN_TTL_MS),
    ),
    null,
  );
});
