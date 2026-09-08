import assert from "node:assert/strict";
import test from "node:test";

import {
  deliverSponsorUpdate,
  companionPageUrl,
  isSponsorUpdateRecipient,
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

test("fans out with bounded concurrency while preserving sponsorship order", async () => {
  let active = 0;
  let maxActive = 0;
  const sponsorships = Array.from({ length: 8 }, (_, index) => ({
    id: `sponsor-${index}`,
    sponsor: {
      email: `sponsor-${index}@example.com`,
    },
  }));

  const deliveries = await deliverSponsorUpdate(
    "org-a",
    sponsorUpdate,
    sponsorships,
    async () => async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
    },
  );

  assert.equal(maxActive, 4);
  assert.deepEqual(
    deliveries.map(({ sponsorshipId }) => sponsorshipId),
    sponsorships.map(({ id }) => id),
  );
});

test("carries a described send through the delivery record", async () => {
  const described = {
    dryRun: true as const,
    connector: "gmail" as const,
    from: "rescue@example.com",
    to: "email@example.com",
    subject: "An update from Biscuit",
    body: "Biscuit had a great walk.",
    contentType: "plain" as const,
  };
  const deliveries = await deliverSponsorUpdate(
    "org-a",
    sponsorUpdate,
    [{ id: "email", sponsor: { email: "email@example.com" } }],
    async () => async () => described,
  );

  assert.deepEqual(deliveries, [
    { sponsorshipId: "email", channel: "email", status: "sent", describedSend: described },
  ]);
});

test("delivers to the Sponsor email currently loaded at approval time", async () => {
  const sponsorship = {
    id: "updated",
    sponsor: { email: "old@example.com" },
  };
  sponsorship.sponsor.email = "new@example.com";

  let deliveredTo = "";
  await deliverSponsorUpdate(
    "org-a",
    sponsorUpdate,
    [sponsorship],
    async () => async (input) => {
      deliveredTo = input.to;
    },
  );

  assert.equal(deliveredTo, "new@example.com");
});

test("prepares one sender before the concurrent fan-out", async () => {
  let preparations = 0;
  let sends = 0;
  await deliverSponsorUpdate(
    "org-a",
    sponsorUpdate,
    [
      { id: "one", sponsor: { email: "one@example.com" } },
      { id: "two", sponsor: { email: "two@example.com" } },
    ],
    async () => {
      preparations += 1;
      return async () => {
        sends += 1;
      };
    },
  );

  assert.equal(preparations, 1);
  assert.equal(sends, 2);
});

test("selects active recipients for regular updates and adopted-ended recipients for graduations", () => {
  const active = { status: "active" as const, endedReason: null };
  const adopted = { status: "ended" as const, endedReason: "adopted" as const };
  const unavailable = { status: "ended" as const, endedReason: "unavailable" as const };
  const cancelled = { status: "ended" as const, endedReason: "canceled" as const };

  assert.equal(isSponsorUpdateRecipient("regular", active), true);
  assert.equal(isSponsorUpdateRecipient("regular", adopted), false);
  assert.equal(isSponsorUpdateRecipient("graduation", adopted), true);
  assert.equal(isSponsorUpdateRecipient("graduation", unavailable), false);
  assert.equal(isSponsorUpdateRecipient("graduation", cancelled), false);
});
