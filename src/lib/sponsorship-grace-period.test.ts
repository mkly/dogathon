import assert from "node:assert/strict";
import test from "node:test";

import {
  AWAITING_SPONSORSHIP_END_DAYS,
  AWAITING_SPONSORSHIP_REMINDER_DAYS,
  createSponsorshipGracePeriodProcessor,
} from "./sponsorship-grace-period.ts";
import { SponsorshipTransferError } from "./sponsorship-transfer.ts";

const now = new Date("2026-09-08T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;

function awaiting(id: string, days: number) {
  return {
    id,
    orgId: "org-1",
    awaitingSince: new Date(now.getTime() - days * day),
    organization: { slug: "huffy-puff" },
    resident: { id: `resident-${id}`, name: "Biscuit", unavailabilityReason: "adopted" as const },
    sponsor: { name: "Morgan" },
  };
}

test("drafts one reminder at 14 days and does not end the sponsorship", async () => {
  const drafted: string[] = [];
  const ended: string[] = [];
  let cutoffIso = "";
  const process = createSponsorshipGracePeriodProcessor({
    now: () => now,
    async listAwaiting(_orgId, nextCutoff) {
      cutoffIso = nextCutoff.toISOString();
      return [awaiting("reminder", AWAITING_SPONSORSHIP_REMINDER_DAYS)];
    },
    async draftReminder(sponsorship) { drafted.push(sponsorship.id); return true; },
    async endSponsorship(id) { ended.push(id); },
  });

  assert.deepEqual(await process("org-1"), { drafted: 1, ended: 0, skipped: 0 });
  assert.equal(cutoffIso, "2026-08-25T12:00:00.000Z");
  assert.deepEqual(drafted, ["reminder"]);
  assert.deepEqual(ended, []);
});

test("ends a sponsorship at 30 days instead of drafting a stale reminder", async () => {
  const actions: string[] = [];
  const process = createSponsorshipGracePeriodProcessor({
    now: () => now,
    async listAwaiting() { return [awaiting("ending", AWAITING_SPONSORSHIP_END_DAYS)]; },
    async draftReminder() { actions.push("draft"); return true; },
    async endSponsorship(id, reason) { actions.push(`end:${id}:${reason}`); },
  });

  assert.deepEqual(await process("org-1"), { drafted: 0, ended: 1, skipped: 0 });
  assert.deepEqual(actions, ["end:ending:adopted"]);
});

test("duplicate runs count lost reminder and ending claims as skipped", async () => {
  const process = createSponsorshipGracePeriodProcessor({
    now: () => now,
    async listAwaiting() {
      return [awaiting("reminder", 20), awaiting("ending", 31)];
    },
    async draftReminder() { return false; },
    async endSponsorship() { throw new SponsorshipTransferError("not_awaiting"); },
  });

  assert.deepEqual(await process("org-1"), { drafted: 0, ended: 0, skipped: 2 });
});
