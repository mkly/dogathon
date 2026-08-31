import assert from "node:assert/strict";
import test from "node:test";

import { deliverPupdate } from "./pupdate-delivery.ts";

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
      { id: "email", sponsorEmail: "email@example.com", sponsorPhone: null, channel: "email" },
      { id: "both", sponsorEmail: "both@example.com", sponsorPhone: "+15551234567", channel: "both" },
      { id: "sms", sponsorEmail: "sms@example.com", sponsorPhone: "+15557654321", channel: "sms" },
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
      { id: "broken", sponsorEmail: "broken@example.com", sponsorPhone: null, channel: "email" },
      { id: "working", sponsorEmail: "working@example.com", sponsorPhone: null, channel: "email" },
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
