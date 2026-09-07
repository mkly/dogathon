import assert from "node:assert/strict";
import test from "node:test";

import { formatMonthlyAmount, sponsorshipStatusLabel } from "./format.ts";

test("formats monthly sponsorship amounts stored in cents", () => {
  assert.equal(formatMonthlyAmount(2500), "$25");
  assert.equal(formatMonthlyAmount(123456), "$1,234.56");
});

test("formats sponsorship statuses for display", () => {
  assert.equal(sponsorshipStatusLabel("active"), "Active");
  assert.equal(sponsorshipStatusLabel("ended"), "Ended");
});
