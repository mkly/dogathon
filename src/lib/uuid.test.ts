import assert from "node:assert/strict";
import test from "node:test";

import { isUuid } from "./uuid";

test("isUuid accepts canonical UUID strings case-insensitively", () => {
  assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
  assert.equal(isUuid("550E8400-E29B-41D4-A716-446655440000"), true);
});

test("isUuid accepts canonical UUIDs independently of version and variant bits", () => {
  assert.equal(isUuid("00000000-0000-0000-0000-000000000000"), true);
  assert.equal(isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff"), true);
});

test("isUuid rejects non-canonical strings and non-string values", () => {
  for (const value of [
    "550e8400e29b41d4a716446655440000",
    "{550e8400-e29b-41d4-a716-446655440000}",
    "550e8400-e29b-41d4-a716-44665544000",
    "550e8400-e29b-41d4-a716-44665544000g",
    " 550e8400-e29b-41d4-a716-446655440000",
    "not-a-uuid",
    "",
    null,
    undefined,
    42,
  ]) {
    assert.equal(isUuid(value), false, `expected ${String(value)} to be rejected`);
  }
});
