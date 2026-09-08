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
      return { id: "resident-id", available: true, _count: { sponsorships: 0 } };
    },
  );

  assert.deepEqual(calls, [["rescue-id", "https://rescue.example/dogs/biscuit"]]);
  assert.deepEqual(result, {
    href: "/happy-paws/companions/resident-id",
    kind: "redirect",
  });
});

for (const [condition, resident] of [
  ["unavailable", { id: "unavailable-id", available: false, _count: { sponsorships: 0 } }],
  ["already sponsored", { id: "sponsored-id", available: true, _count: { sponsorships: 1 } }],
] as const) {
  test(`a resident that is ${condition} renders the unavailable path`, async () => {
    const result = await resolveSponsorDestination(
      { orgId: "rescue-id", orgSlug: "happy-paws", source: "https://rescue.example/dogs/fern" },
      async () => resident,
    );

    assert.deepEqual(result, { kind: "unknown" });
  });
}

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
    return { id: "unexpected", available: true, _count: { sponsorships: 0 } };
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
