import assert from "node:assert/strict";
import test from "node:test";

import { formatMonthlyAmount, sponsorshipStatusLabel } from "./format.ts";

test("formats whole-dollar monthly sponsorship amounts", () => {
  assert.equal(formatMonthlyAmount(25), "$25");
  assert.equal(formatMonthlyAmount(1234), "$1,234");
});

test("formats sponsorship statuses for display", () => {
  assert.equal(sponsorshipStatusLabel("active"), "Active");
  assert.equal(sponsorshipStatusLabel("ended"), "Ended");
});
