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
  organization: { slug: "huffy-puff" },
  resident: {
    name: "Biscuit",
    photoUrls: [],
    sponsorships: [
      {
        id: "active",
        monthlyCents: 2500,
        status: "active" as const,
        endedReason: null as null,
        sponsor: { email: "active@example.com" },
      },
      {
        id: "adopted",
        monthlyCents: 4000,
        status: "ended" as const,
        endedReason: "adopted" as const,
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
    async claimUpdate() { return 1; },
    async deliver() { return []; },
    async findUpdate() { return baseUpdate; },
    async getConnectorStatus() { return { connected: true, type: "gmail", fromEmail: "staff@example.com" }; },
    async markSent() { return { id: updateId, status: "sent" }; },
    now: () => new Date("2026-09-06T20:00:00Z"),
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

test("graduation approval delivers to adopted-ended sponsorships and marks sent after success", async () => {
  let recipientIds: string[] = [];
  let renderedMonthlyCents = 0;
  let markedSent = false;
  const handler = createApproveSponsorUpdateHandler(dependencies({
    async deliver(_orgId: string, _update: unknown, sponsorships: Array<{ id: string }>) {
      recipientIds = sponsorships.map(({ id }) => id);
      return [{ sponsorshipId: "adopted", channel: "email", status: "sent" }];
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
  assert.deepEqual(recipientIds, ["adopted"]);
  assert.equal(renderedMonthlyCents, 4000);
  assert.equal(markedSent, true);
  assert.deepEqual((await response.json()).counts, { sent: 1, failed: 0 });
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
      return [{ sponsorshipId: "adopted", channel: "email", status: "failed", error: "nope" }];
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
