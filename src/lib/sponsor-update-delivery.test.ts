import assert from "node:assert/strict";
import test from "node:test";

import {
  deliverSponsorUpdate,
  companionPageUrl,
  isRegularSponsorUpdateRecipient,
} from "./sponsor-update-delivery.ts";

test("builds an organization-scoped companion URL", () => {
  assert.equal(
    companionPageUrl("https://rescue.example", "second-chance", "companion/one"),
    "https://rescue.example/second-chance/companions/companion%2Fone",
  );
});

const sponsorUpdate = {
  subject: "An update from Biscuit",
  bodyText: "Biscuit had a great walk.",
};

test("delivers exactly one organization email to every sponsor", async () => {
  const calls: Array<{ orgId: string; to: string; subject: string; body: string }> = [];
  const deliveries = await deliverSponsorUpdate(
    "org-a",
    sponsorUpdate,
    [
      { id: "email", sponsor: { email: "email@example.com" } },
      { id: "second", sponsor: { email: "second@example.com" } },
      { id: "third", sponsor: { email: "third@example.com" } },
    ],
    async (orgId) => async (input) => {
      calls.push({ orgId, to: input.to, subject: input.subject, body: input.body });
    },
  );

  assert.deepEqual(deliveries, [
    { sponsorshipId: "email", channel: "email", status: "sent" },
    { sponsorshipId: "second", channel: "email", status: "sent" },
    { sponsorshipId: "third", channel: "email", status: "sent" },
  ]);
  assert.deepEqual(calls.map(({ orgId, to }) => ({ orgId, to })), [
    { orgId: "org-a", to: "email@example.com" },
    { orgId: "org-a", to: "second@example.com" },
    { orgId: "org-a", to: "third@example.com" },
  ]);
});

test("records a failed email and continues with the remaining sponsors", async () => {
  const deliveries = await deliverSponsorUpdate(
    "org-a",
    sponsorUpdate,
    [
      { id: "broken", sponsor: { email: "broken@example.com" } },
      { id: "working", sponsor: { email: "working@example.com" } },
    ],
    async () => async (input) => {
      if (input.to === "broken@example.com") throw new Error("Connector rejected the message");
    },
  );

  assert.deepEqual(deliveries, [
    {
      sponsorshipId: "broken",
      channel: "email",
      status: "failed",
      error: "Connector rejected the message",
    },
    { sponsorshipId: "working", channel: "email", status: "sent" },
  ]);
});

test("selects active recipients for regular updates", () => {
  const active = { status: "active" as const, endedReason: null };
  const adopted = { status: "ended" as const, endedReason: "adopted" as const };
  const unavailable = { status: "ended" as const, endedReason: "unavailable" as const };
  const cancelled = { status: "ended" as const, endedReason: "canceled" as const };

  assert.equal(isRegularSponsorUpdateRecipient(active, true), true);
  assert.equal(isRegularSponsorUpdateRecipient(active, false), false);
  assert.equal(isRegularSponsorUpdateRecipient(adopted, true), false);
  assert.equal(isRegularSponsorUpdateRecipient(unavailable, false), false);
  assert.equal(isRegularSponsorUpdateRecipient(cancelled, false), false);
});
