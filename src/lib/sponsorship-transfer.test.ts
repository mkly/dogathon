import assert from "node:assert/strict";
import test from "node:test";

import type { Prisma } from "@/generated/prisma/client";

import {
  endAwaitingSponsorship,
  SponsorshipTransferError,
  transferSponsorship,
} from "./sponsorship-transfer.ts";

const sponsorship = {
  id: "00000000-0000-4000-8000-000000000001",
  orgId: "00000000-0000-4000-8000-000000000002",
  residentId: "00000000-0000-4000-8000-000000000003",
  sponsorId: "00000000-0000-4000-8000-000000000004",
  monthlyCents: 2500,
  status: "awaiting" as const,
  endedReason: null,
  endedAt: null,
  stripeCheckoutSessionId: "cs_1",
  stripeSubscriptionId: "sub_1",
  stripeCustomerId: "cus_1",
  createdAt: new Date("2026-08-01T00:00:00Z"),
  updatedAt: new Date("2026-09-01T00:00:00Z"),
  organization: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Best Friends",
    stripeAccountId: "acct_1",
  },
  sponsor: { email: "pat@example.com", name: "Pat" },
};

function harness(
  options: {
    claimed?: number;
    resident?: { id: string; name: string } | null;
    sponsorshipStatus?: "active" | "awaiting";
  } = {},
) {
  const calls = {
    cancel: 0,
    email: 0,
    resident: undefined as unknown,
    revalidate: 0,
    update: undefined as unknown,
  };
  const tx = {
    sponsorship: {
      findUnique: async () => ({
        ...sponsorship,
        status: options.sponsorshipStatus ?? sponsorship.status,
      }),
      updateMany: async (input: unknown) => {
        calls.update = input;
        return { count: options.claimed ?? 1 };
      },
    },
    resident: {
      findFirst: async (input: unknown) => {
        calls.resident = input;
        return options.resident === null
          ? null
          : (options.resident ?? {
              id: "00000000-0000-4000-8000-000000000005",
              name: "Mochi",
            });
      },
    },
  } as unknown as Prisma.TransactionClient;
  const dependencies = {
    transaction: async <T>(
      operation: (client: Prisma.TransactionClient) => Promise<T>,
    ) => operation(tx),
    cancel: async () => {
      calls.cancel += 1;
      return {} as never;
    },
    sendEmail: async () => {
      calls.email += 1;
    },
    revalidateRoster: () => {
      calls.revalidate += 1;
    },
  };
  return { calls, dependencies };
}

test("transfers one awaiting sponsorship without changing billing and sends confirmation", async () => {
  const { calls, dependencies } = harness();
  const result = await transferSponsorship(
    sponsorship.id,
    "00000000-0000-4000-8000-000000000005",
    dependencies,
  );

  assert.equal(result.companionName, "Mochi");
  assert.equal(calls.email, 1);
  assert.equal(calls.revalidate, 1);
  assert.deepEqual(calls.update, {
    where: { id: sponsorship.id, status: { in: ["active", "awaiting"] } },
    data: {
      residentId: "00000000-0000-4000-8000-000000000005",
      status: "active",
      endedAt: null,
      endedReason: null,
    },
  });
});

test("transfers an active sponsorship and releases its former companion", async () => {
  const { calls, dependencies } = harness({ sponsorshipStatus: "active" });
  const result = await transferSponsorship(
    sponsorship.id,
    "00000000-0000-4000-8000-000000000005",
    dependencies,
  );

  assert.equal(result.companionName, "Mochi");
  assert.deepEqual(calls.resident, {
    where: {
      id: {
        equals: "00000000-0000-4000-8000-000000000005",
        not: sponsorship.residentId,
      },
      orgId: sponsorship.orgId,
      available: true,
      sponsorships: { none: { status: "active" } },
    },
    select: { id: true, name: true },
  });
  assert.deepEqual(calls.update, {
    where: { id: sponsorship.id, status: { in: ["active", "awaiting"] } },
    data: {
      residentId: "00000000-0000-4000-8000-000000000005",
      status: "active",
      endedAt: null,
      endedReason: null,
    },
  });
});

test("a lost transfer claim never sends a confirmation", async () => {
  const { calls, dependencies } = harness({ claimed: 0 });
  await assert.rejects(
    transferSponsorship(
      sponsorship.id,
      "00000000-0000-4000-8000-000000000005",
      dependencies,
    ),
    (error) =>
      error instanceof SponsorshipTransferError &&
      error.code === "not_transferable",
  );
  assert.equal(calls.email, 0);
});

test("refuses the current resident before changing the sponsorship", async () => {
  const { calls, dependencies } = harness({
    resident: null,
    sponsorshipStatus: "active",
  });
  await assert.rejects(
    transferSponsorship(sponsorship.id, sponsorship.residentId, dependencies),
    (error) =>
      error instanceof SponsorshipTransferError &&
      error.code === "resident_unavailable",
  );
  assert.equal(calls.update, undefined);
});

test("refuses a resident with an active sponsorship before changing the sponsorship", async () => {
  const { calls, dependencies } = harness({ resident: null });
  await assert.rejects(
    transferSponsorship(
      sponsorship.id,
      "00000000-0000-4000-8000-000000000005",
      dependencies,
    ),
    (error) =>
      error instanceof SponsorshipTransferError &&
      error.code === "resident_unavailable",
  );
  assert.equal(calls.update, undefined);
});

test("ends an awaiting sponsorship and cancels billing once", async () => {
  const { calls, dependencies } = harness();
  const result = await endAwaitingSponsorship(
    sponsorship.id,
    "adopted",
    dependencies,
  );
  assert.equal(result.endedReason, "adopted");
  assert.equal(calls.cancel, 1);
  assert.equal(calls.email, 1);
});
