import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { createApproveSponsorUpdateHandler } = await import("./route.ts");

const updateId = "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8";
const baseUpdate = {
  id: updateId,
  orgId: "org-1",
  residentId: "resident-1",
  type: "graduation" as const,
  subject: "Biscuit found a home!",
  teaser: "A joyful new chapter begins.",
  bodyText: "Biscuit has been adopted!",
  heroPhotoUrl: null,
  status: "draft" as const,
  sponsorshipId: "active",
  awaitingTransitionedAt: null,
  isAwaitingReminder: false,
  organization: { name: "Huffy Puff Rescue", slug: "huffy-puff", stripeAccountId: "acct_rescue" },
  sponsorship: {
    id: "active",
    monthlyCents: 2500,
    residentId: "resident-1",
    status: "active" as const,
    endedReason: null,
    stripeSubscriptionId: "sub_active",
    sponsor: { email: "active@example.com" },
  },
  resident: {
    name: "Biscuit",
    available: false,
    photoUrls: [],
    sponsorships: [
      {
        id: "active",
        monthlyCents: 2500,
        residentId: "resident-1",
        status: "active" as const,
        endedReason: null as null,
        stripeSubscriptionId: "sub_active",
        sponsor: { email: "active@example.com" },
      },
      {
        id: "adopted",
        monthlyCents: 4000,
        residentId: "resident-1",
        status: "ended" as const,
        endedReason: "adopted" as const,
        stripeSubscriptionId: "sub_adopted",
        sponsor: { email: "adopted@example.com" },
      },
    ],
  },
};

function request() {
  return new Request(`https://untrusted.example/api/sponsor-updates/${updateId}/approve`, {
    method: "POST",
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    async claimUpdate() { return true; },
    async composeGraduation() { return "no-pending-chats" as const; },
    async deliver() { return []; },
    async findUpdate() { return baseUpdate; },
    async getConnectorStatus() { return { connected: true, type: "gmail", fromEmail: "staff@example.com" }; },
    async markSent() { return { id: updateId, status: "sent" }; },
    now: () => new Date("2026-09-06T20:00:00Z"),
    async pauseCollection() {},
    async renderMessage() {
      return { subject: "Biscuit has been adopted", bodyHtml: "<p>Adopted</p>", bodyText: "Adopted" };
    },
    async requireOrganization() {
      return { ok: true, context: { orgId: "org-1" } };
    },
    async resetDraft() {},
    ...overrides,
  } as never;
}

function context() {
  return { params: Promise.resolve({ id: updateId }) };
}

test("rejects a graduation draft linked to a sponsorship that was already awaiting", async () => {
  let claimed = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async findUpdate() {
      return {
        ...baseUpdate,
        sponsorship: { ...baseUpdate.sponsorship, status: "awaiting" as const },
      };
    },
    async claimUpdate() {
      claimed = true;
      return true;
    },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 409);
  assert.equal(claimed, false);
});

test("rejects a graduation draft after its sponsorship was transferred", async () => {
  let claimed = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async findUpdate() {
      return {
        ...baseUpdate,
        sponsorship: { ...baseUpdate.sponsorship, residentId: "resident-2" },
      };
    },
    async claimUpdate() {
      claimed = true;
      return true;
    },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 409);
  assert.equal(claimed, false);
});

test("an exception after the approval claim reverts the update to draft", async () => {
  let reset = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async renderMessage() { throw new Error("render failed"); },
    async resetDraft() { reset = true; },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 502);
  assert.equal(reset, true);
});

test("all failed deliveries revert to draft and never mark the update sent", async () => {
  let reset = false;
  let markedSent = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async deliver() {
      return [{ sponsorshipId: "active", channel: "email", status: "failed", error: "nope" }];
    },
    async markSent() { markedSent = true; },
    async resetDraft() { reset = true; },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 502);
  assert.equal(reset, true);
  assert.equal(markedSent, false);
  assert.deepEqual((await response.json()).counts, { sent: 0, failed: 1 });
});
