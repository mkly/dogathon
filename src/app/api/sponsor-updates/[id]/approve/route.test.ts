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
  bodyText: "Biscuit has been adopted!",
  photoUrl: null,
  status: "draft" as const,
  sponsorshipId: "active",
  awaitingTransitionedAt: null,
  organization: { slug: "huffy-puff", stripeAccountId: "acct_rescue" },
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
    async deliver() { return []; },
    async findUpdate() { return baseUpdate; },
    async getConnectorStatus() { return { connected: true, type: "gmail", fromEmail: "staff@example.com" }; },
    async markSent() { return { id: updateId, status: "sent" }; },
    now: () => new Date("2026-09-06T20:00:00Z"),
    async pauseCollection() {},
    async renderMessage() { return { bodyHtml: "<p>Adopted</p>", bodyText: "Adopted" }; },
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

test("graduation approval transitions, pauses, then delivers only to its linked sponsorship", async () => {
  let recipientIds: string[] = [];
  let renderedMonthlyCents = 0;
  let markedSent = false;
  const events: string[] = [];
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async claimUpdate() {
      events.push("transition");
      return true;
    },
    async pauseCollection(input: { stripeAccountId?: string | null; subscriptionId?: string | null }) {
      events.push("pause");
      assert.deepEqual(input, { stripeAccountId: "acct_rescue", subscriptionId: "sub_active" });
    },
    async deliver(_orgId: string, _update: unknown, sponsorships: Array<{ id: string }>) {
      events.push("deliver");
      recipientIds = sponsorships.map(({ id }) => id);
      return [{ sponsorshipId: "active", channel: "email", status: "sent" }];
    },
    async renderMessage(_update: unknown, monthlyCents: number) {
      renderedMonthlyCents = monthlyCents;
      return { bodyHtml: "<p>Adopted</p>", bodyText: "Adopted" };
    },
    async markSent() {
      markedSent = true;
      return { id: updateId, status: "sent" };
    },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(events, ["transition", "pause", "deliver"]);
  assert.deepEqual(recipientIds, ["active"]);
  assert.equal(renderedMonthlyCents, 2500);
  assert.equal(markedSent, true);
  assert.deepEqual((await response.json()).counts, { sent: 1, failed: 0 });
});

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

test("allows the same draft to retry after it already performed the awaiting transition", async () => {
  let paused = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async findUpdate() {
      return {
        ...baseUpdate,
        awaitingTransitionedAt: new Date("2026-09-06T19:00:00Z"),
        sponsorship: { ...baseUpdate.sponsorship, status: "awaiting" as const },
      };
    },
    async pauseCollection() { paused = true; },
    async deliver() {
      return [{ sponsorshipId: "active", channel: "email", status: "sent" }];
    },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 200);
  assert.equal(paused, true);
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

test("a Stripe pause failure returns the update to draft before delivery", async () => {
  let delivered = false;
  let reset = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async pauseCollection() { throw new Error("Stripe unavailable"); },
    async deliver() { delivered = true; return []; },
    async resetDraft() { reset = true; },
  }));

  const response = await handler(request(), context());
  assert.equal(response.status, 502);
  assert.equal(delivered, false);
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
