import assert from "node:assert/strict";
import test from "node:test";

import { deliverPupdate, companionPageUrl } from "./pupdate-delivery.ts";

test("builds an organization-scoped companion URL", () => {
  assert.equal(
    companionPageUrl("https://rescue.example", "second-chance", "companion/one"),
    "https://rescue.example/second-chance/companions/companion%2Fone",
  );
});

const pupdate = {
  subject: "A pupdate from Biscuit",
  bodyText: "Biscuit had a great walk.",
  smsText: "Legacy composer text",
};

test("delivers exactly one organization email to every sponsor, including legacy SMS preferences", async () => {
  const calls: Array<{ orgId: string; to: string; subject: string; body: string }> = [];
  const deliveries = await deliverPupdate(
    "org-a",
    pupdate,
    [
      { id: "email", sponsor: { email: "email@example.com", phone: null, channel: "email" } },
      { id: "both", sponsor: { email: "both@example.com", phone: "+15551234567", channel: "both" } },
      { id: "sms", sponsor: { email: "sms@example.com", phone: "+15557654321", channel: "sms" } },
    ],
    async (orgId, input) => {
      calls.push({ orgId, to: input.to, subject: input.subject, body: input.body });
    },
  );

  assert.deepEqual(deliveries, [
    { sponsorshipId: "email", channel: "email", status: "sent" },
    { sponsorshipId: "both", channel: "email", status: "sent" },
    { sponsorshipId: "sms", channel: "email", status: "sent" },
  ]);
  assert.deepEqual(calls.map(({ orgId, to }) => ({ orgId, to })), [
    { orgId: "org-a", to: "email@example.com" },
    { orgId: "org-a", to: "both@example.com" },
    { orgId: "org-a", to: "sms@example.com" },
  ]);
});

test("records a failed email and continues with the remaining sponsors", async () => {
  const deliveries = await deliverPupdate(
    "org-a",
    pupdate,
    [
      { id: "broken", sponsor: { email: "broken@example.com", phone: null, channel: "email" } },
      { id: "working", sponsor: { email: "working@example.com", phone: null, channel: "email" } },
    ],
    async (_orgId, input) => {
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
      phone: null,
      channel: "email" as const,
    },
  }));

  const deliveries = await deliverPupdate("org-a", pupdate, sponsorships, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
  });

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
    subject: "A pupdate from Biscuit",
    body: "Biscuit had a great walk.",
    contentType: "plain" as const,
  };
  const deliveries = await deliverPupdate(
    "org-a",
    pupdate,
    [{ id: "email", sponsor: { email: "email@example.com", phone: null, channel: "email" } }],
    async () => described,
  );

  assert.deepEqual(deliveries, [
    { sponsorshipId: "email", channel: "email", status: "sent", describedSend: described },
  ]);
});

test("delivers to the Sponsor email currently loaded at approval time", async () => {
  const sponsorship = {
    id: "updated",
    sponsor: { email: "old@example.com", phone: null, channel: "email" as const },
  };
  sponsorship.sponsor.email = "new@example.com";

  let deliveredTo = "";
  await deliverPupdate("org-a", pupdate, [sponsorship], async (_orgId, input) => {
    deliveredTo = input.to;
  });

  assert.equal(deliveredTo, "new@example.com");
});
