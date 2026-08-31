import assert from "node:assert/strict";
import test from "node:test";

import { deliverPupdate, dogPageUrl } from "./pupdate-delivery.ts";

test("builds an organization-scoped dog URL", () => {
  assert.equal(
    dogPageUrl("https://rescue.example", "second-chance", "dog/one"),
    "https://rescue.example/second-chance/dogs/dog%2Fone",
  );
});

test("fans out one dry-run delivery for every selected sponsor channel", async () => {
  const emailCalls: Array<{ to: string; subject: string; body: string }> = [];
  const smsCalls: Array<{ to: string; body: string }> = [];

  const deliveries = await deliverPupdate(
    {
      subject: "A pupdate from Biscuit",
      bodyText: "Biscuit had a great walk.",
      smsText: "Biscuit had a great walk.",
    },
    [
      {
        id: "email-sponsor",
        sponsorEmail: "email@example.com",
        sponsorPhone: null,
        channel: "email",
      },
      {
        id: "both-sponsor",
        sponsorEmail: "both@example.com",
        sponsorPhone: "+15551234567",
        channel: "both",
      },
      {
        id: "sms-sponsor",
        sponsorEmail: "sms@example.com",
        sponsorPhone: "+15557654321",
        channel: "sms",
      },
    ],
    "https://rescue.example/dogs/biscuit",
    {
      email: async (input) => {
        emailCalls.push(input);
        return { dryRun: true } as never;
      },
      sms: async (input) => {
        smsCalls.push(input);
        return { dryRun: true } as never;
      },
    },
  );

  assert.deepEqual(
    deliveries.map(({ sponsorshipId, channel }) => `${sponsorshipId}:${channel}`),
    ["email-sponsor:email", "both-sponsor:email", "both-sponsor:sms", "sms-sponsor:sms"],
  );
  assert.ok(deliveries.every((delivery) => delivery.status === "sent"));
  assert.equal(emailCalls.length, 2);
  assert.equal(smsCalls.length, 2);
  assert.ok(smsCalls.every((call) => call.body.endsWith("https://rescue.example/dogs/biscuit")));
});

test("delivers through the real credential-free Arcade wrappers", async () => {
  const previousApiKey = process.env.ARCADE_API_KEY;
  delete process.env.ARCADE_API_KEY;

  try {
    const deliveries = await deliverPupdate(
      {
        subject: "A pupdate from Biscuit",
        bodyText: "Biscuit had a great walk.",
        smsText: "Biscuit had a great walk.",
      },
      [
        {
          id: "both-sponsor",
          sponsorEmail: "both@example.com",
          sponsorPhone: "+15551234567",
          channel: "both",
        },
      ],
      "https://rescue.example/dogs/biscuit",
    );

    assert.deepEqual(deliveries, [
      { sponsorshipId: "both-sponsor", channel: "email", status: "sent" },
      { sponsorshipId: "both-sponsor", channel: "sms", status: "sent" },
    ]);
  } finally {
    if (previousApiKey === undefined) delete process.env.ARCADE_API_KEY;
    else process.env.ARCADE_API_KEY = previousApiKey;
  }
});

test("records a failed send and still delivers to the remaining sponsors", async () => {
  const smsCalls: Array<{ to: string; body: string }> = [];

  const deliveries = await deliverPupdate(
    {
      subject: "A pupdate from Biscuit",
      bodyText: "Biscuit had a great walk.",
      smsText: "Biscuit had a great walk.",
    },
    [
      {
        id: "broken-sponsor",
        sponsorEmail: "broken@example.com",
        sponsorPhone: null,
        channel: "email",
      },
      {
        id: "sms-sponsor",
        sponsorEmail: "sms@example.com",
        sponsorPhone: "+15557654321",
        channel: "sms",
      },
    ],
    "https://rescue.example/dogs/biscuit",
    {
      email: async () => {
        throw new Error("Gmail is not connected");
      },
      sms: async (input) => {
        smsCalls.push(input);
        return { dryRun: true } as never;
      },
    },
  );

  assert.deepEqual(deliveries, [
    {
      sponsorshipId: "broken-sponsor",
      channel: "email",
      status: "failed",
      error: "Gmail is not connected",
    },
    { sponsorshipId: "sms-sponsor", channel: "sms", status: "sent" },
  ]);
  assert.equal(smsCalls.length, 1);
});
