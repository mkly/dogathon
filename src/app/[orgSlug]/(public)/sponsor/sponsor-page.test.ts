import assert from "node:assert/strict";
import test from "node:test";

import { resolveSponsorDestination } from "./sponsor-page.ts";

test("a found source redirects to its companion page with a normalized identity", async () => {
  const calls: Array<[string, string]> = [];
  const result = await resolveSponsorDestination(
    {
      orgId: "rescue-id",
      orgSlug: "happy-paws",
      source: "HTTPS://Rescue.Example/dogs/biscuit/?utm_source=template#bio",
    },
    async (orgId, sourceUrl) => {
      calls.push([orgId, sourceUrl]);
      return { id: "resident-id", available: true };
    },
  );

  assert.deepEqual(calls, [["rescue-id", "https://rescue.example/dogs/biscuit"]]);
  assert.deepEqual(result, {
    href: "/happy-paws/companions/resident-id",
    kind: "redirect",
  });
});

test("an unavailable resident still redirects to the companion page", async () => {
  const result = await resolveSponsorDestination(
    { orgId: "rescue-id", orgSlug: "happy-paws", source: "https://rescue.example/dogs/fern" },
    async () => ({ id: "unavailable-id", available: false }),
  );

  assert.deepEqual(result, {
    href: "/happy-paws/companions/unavailable-id",
    kind: "redirect",
  });
});

test("an unknown source renders the unavailable path", async () => {
  const result = await resolveSponsorDestination(
    { orgId: "rescue-id", orgSlug: "happy-paws", source: "https://rescue.example/dogs/new" },
    async () => null,
  );

  assert.deepEqual(result, { kind: "unknown" });
});

test("missing, invalid, non-http, and oversized sources do not query the roster", async () => {
  let lookups = 0;
  const findResident = async () => {
    lookups += 1;
    return { id: "unexpected", available: true };
  };

  for (const source of [
    undefined,
    "not a URL",
    "ftp://rescue.example/dogs/fern",
    `https://rescue.example/${"x".repeat(2049)}`,
  ]) {
    assert.deepEqual(
      await resolveSponsorDestination(
        { orgId: "rescue-id", orgSlug: "happy-paws", source },
        findResident,
      ),
      { kind: "unknown" },
    );
  }
  assert.equal(lookups, 0);
});
