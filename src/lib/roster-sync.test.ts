import assert from "node:assert/strict";
import test from "node:test";

import {
  assertPlausibleUnavailableCount,
  allocateResidentSlug,
  assertRelatedUrl,
  markResidentAdopted,
  adoptionDraft,
  loadRoster,
  onlyIdentifyingSourceUrls,
  planRosterAvailabilityChanges,
  requestFirecrawl,
  residentSlug,
  RosterSyncRefusal,
  upsertCompanions,
} from "./roster-sync.ts";
import type { SyncTransaction } from "./roster-sync.ts";

function rosterCompanion(name: string, adopted: boolean) {
  return {
    name,
    species: "",
    breed: "",
    dobText: "",
    ageText: "",
    sex: "",
    weightText: "",
    personality: "",
    careNotes: [],
    photoUrls: [],
    adopted,
  };
}

test("only a page that yielded one companion names it", () => {
  const listing = "https://rescue.example/companions";
  const detail = "https://rescue.example/companions/hattie";
  const companions = onlyIdentifyingSourceUrls([
    { ...rosterCompanion("Biscuit", false), sourceUrl: listing },
    { ...rosterCompanion("Juniper", false), sourceUrl: listing },
    { ...rosterCompanion("Hattie", false), sourceUrl: detail },
    { ...rosterCompanion("Unknown page", false), sourceUrl: "" },
  ]);

  assert.deepEqual(companions.map((companion) => companion.sourceUrl), ["", "", detail, ""]);
});

test("resident slugs normalize names and suffix collisions inside an organization", () => {
  const usedSlugs = new Set(["chex", "chex-2"]);

  assert.equal(residentSlug("  Miss Piggy!  "), "miss-piggy");
  assert.equal(residentSlug("🐕"), "resident");
  assert.equal(allocateResidentSlug("Chex", usedSlugs), "chex-3");
  assert.equal(allocateResidentSlug("CHEX!", usedSlugs), "chex-4");
});

test("a source URL match updates a renamed companion", async () => {
  const writes: unknown[] = [];
  const tx = {
    resident: {
      findMany: async () => [{
        name: "Biscuit",
        slug: "biscuit",
        sourceUrl: "https://rescue.example/dogs/biscuit",
      }],
      findFirst: async () => ({ id: "resident-1", unavailabilityReason: null }),
      update: async (input: unknown) => { writes.push(input); },
      upsert: async () => { throw new Error("existing companion should not be created"); },
    },
  } as unknown as SyncTransaction;

  await upsertCompanions(tx, "org-rescue", [{
    ...rosterCompanion("Renamed Biscuit", false),
    species: "Puppies",
    sourceUrl: "HTTPS://RESCUE.EXAMPLE/dogs/biscuit/?utm_source=newsletter",
  }], true);

  assert.deepEqual(writes, [{
    where: { id_orgId: { id: "resident-1", orgId: "org-rescue" } },
    data: {
      name: "Renamed Biscuit",
      species: "dog", breed: "", dobText: "", ageText: "", sex: "", weightText: "", personality: "",
      careNotes: [], photoUrls: [], sourceUrl: "https://rescue.example/dogs/biscuit",
      available: true, unavailabilityReason: null,
    },
  }]);
});

test("live upserts restore unavailable residents but preserve adopted residents", async () => {
  const writes: unknown[] = [];
  const tx = {
    resident: {
      findMany: async () => [],
      findFirst: async (input: { where: { name?: string } }) => (
        input.where.name === "Hattie"
          ? { id: "resident-unavailable", unavailabilityReason: "unavailable" }
          : { id: "resident-adopted", unavailabilityReason: "adopted" }
      ),
      update: async (input: unknown) => { writes.push(input); },
    },
  } as unknown as SyncTransaction;

  await upsertCompanions(
    tx,
    "org-rescue",
    [rosterCompanion("Hattie", false), rosterCompanion("Walnut", false)],
    true,
  );

  const updates = writes as Array<{ where: { id_orgId: { id: string } }; data: Record<string, unknown> }>;
  const restored = updates.find((update) => update.where.id_orgId.id === "resident-unavailable")?.data ?? {};
  const preserved = updates.find((update) => update.where.id_orgId.id === "resident-adopted")?.data ?? {};
  assert.equal(restored.available, true);
  assert.equal(restored.unavailabilityReason, null);
  assert.equal("available" in preserved, false);
  assert.equal("unavailabilityReason" in preserved, false);
});

test("related roster URLs still reject private and IP-literal hosts", () => {
  for (const candidate of [
    "http://localhost/dogs",
    "http://10.0.0.1/dogs",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/dogs",
  ]) {
    assert.throws(
      () => assertRelatedUrl(candidate, candidate),
      /private or non-public host/u,
    );
  }
});

test("adoption changes only resident availability and drafts one notice per active sponsorship", async () => {
  const residentUpdates: unknown[] = [];
  const drafts: unknown[] = [];
  const tx = {
    resident: {
      update: async (input: unknown) => {
        residentUpdates.push(input);
      },
    },
    sponsorship: {
      findMany: async () => [
        { id: "sponsorship-1", sponsor: { name: "Sam" } },
        { id: "sponsorship-2", sponsor: { name: "Lee" } },
      ],
    },
    volunteerPhoto: {
      findFirst: async () => ({ url: "/uploads/latest.jpg", webUrl: null }),
    },
    sponsorUpdate: {
      create: async (input: unknown) => {
        drafts.push(input);
      },
    },
  } as unknown as SyncTransaction;

  const closed = await markResidentAdopted(
    tx,
    "org-rescue",
    { id: "resident-1", name: "Hattie", photoUrls: ["/residents/hattie.jpg"] },
  );

  assert.equal(closed, 2);
  assert.deepEqual(residentUpdates, [{
    where: { id_orgId: { id: "resident-1", orgId: "org-rescue" } },
    data: { available: false, unavailabilityReason: "adopted" },
  }]);
  assert.equal(drafts.length, 2);
  assert.deepEqual(drafts, [
    { data: { ...adoptionDraft("resident-1", "sponsorship-1", "Hattie", "Sam", "adopted", "/uploads/latest.jpg"), orgId: "org-rescue" } },
    { data: { ...adoptionDraft("resident-1", "sponsorship-2", "Hattie", "Lee", "adopted", "/uploads/latest.jpg"), orgId: "org-rescue" } },
  ]);
});

test("refuses a crawl request for an unrelated host before fetching", async () => {
  let fetchCalls = 0;
  const fetcher: typeof fetch = async () => {
    fetchCalls += 1;
    return Response.json({ success: true, id: "should-not-run" });
  };

  await assert.rejects(
    requestFirecrawl(
      "firecrawl_crawl",
      { url: "https://elsewhere.test/companions" },
      {
        apiKey: "fc-test",
        sourceUrl: "https://rescue.example/adopt/companions",
        fetch: fetcher,
      },
    ),
    /refused unrelated host: elsewhere\.test/,
  );
  assert.equal(fetchCalls, 0);
});

test("refuses a sibling host under a shared public suffix", async () => {
  let fetchCalls = 0;
  const fetcher: typeof fetch = async () => {
    fetchCalls += 1;
    return Response.json({ success: true, id: "should-not-run" });
  };

  await assert.rejects(
    requestFirecrawl(
      "firecrawl_crawl",
      { url: "https://unrelated.co.uk/companions" },
      {
        apiKey: "fc-test",
        sourceUrl: "https://www.co.uk/companions",
        fetch: fetcher,
      },
    ),
    /refused unrelated host: unrelated\.co\.uk/,
  );
  assert.equal(fetchCalls, 0);
});

test("refuses a sibling tenant on a shared private suffix", async () => {
  let fetchCalls = 0;
  const fetcher: typeof fetch = async () => {
    fetchCalls += 1;
    return Response.json({ success: true, id: "should-not-run" });
  };

  await assert.rejects(
    requestFirecrawl(
      "firecrawl_crawl",
      { url: "https://unrelated.github.io/companions" },
      {
        apiKey: "fc-test",
        sourceUrl: "https://rescue.github.io/companions",
        fetch: fetcher,
      },
    ),
    /refused unrelated host: unrelated\.github\.io/,
  );
  assert.equal(fetchCalls, 0);
});

test("adoption drafts are queued and sponsor-specific", () => {
  const draft = adoptionDraft(
    "companion-1",
    "sponsorship-1",
    "Hattie",
    "Sam",
    "adopted",
    "/uploads/hattie.jpg",
  );

  assert.equal(draft.type, "graduation");
  assert.equal(draft.status, "draft");
  assert.equal(draft.sponsorshipId, "sponsorship-1");
  assert.match(draft.teaser, /found a home/i);
  assert.equal(draft.heroPhotoUrl, "/uploads/hattie.jpg");
  assert.match(draft.bodyText, /Sam/);
  assert.match(draft.bodyText, /sponsorship will pause/i);
  assert.doesNotMatch(draft.bodyText, /sponsorship has ended/i);
});

test("unavailability drafts say the companion is no longer at the rescue", () => {
  const draft = adoptionDraft(
    "companion-1",
    "sponsorship-1",
    "Hattie",
    "Sam",
    "unavailable",
    null,
  );

  assert.match(draft.bodyText, /no longer at the rescue/i);
  assert.match(draft.subject, /no longer at the rescue/i);
  assert.doesNotMatch(draft.bodyText, /has been adopted/i);
});

test("refuses a live sync that would mark most available residents unavailable", () => {
  assert.throws(
    () => assertPlausibleUnavailableCount(10, 6, false),
    (error) => error instanceof RosterSyncRefusal
      && /mark 6 of 10 available residents unavailable/.test(error.reason),
  );
});

test("allows a plausible live adoption count", () => {
  assert.doesNotThrow(() => assertPlausibleUnavailableCount(10, 2, false));
});

test("preserves explicit adoption handling for fallback captures", () => {
  assert.doesNotThrow(() => assertPlausibleUnavailableCount(10, 10, true));
});

test("an incomplete crawl does not adopt a resident missing from the partial roster", () => {
  const changes = planRosterAvailabilityChanges(
    [{ id: "resident-1", name: "Hattie", available: true }],
    [rosterCompanion("Walnut", false)],
    { usedFallbackCapture: false, rosterComplete: false },
  );

  assert.deepEqual(changes.unavailableCandidates, []);
});

test("an incomplete crawl still adopts a resident with an explicit Adopted marker", () => {
  const resident = { id: "resident-1", name: "Hattie", available: true };
  const changes = planRosterAvailabilityChanges(
    [resident],
    [rosterCompanion("Hattie", true)],
    { usedFallbackCapture: false, rosterComplete: false },
  );

  assert.deepEqual(changes.adoptedCandidates, [resident]);
  assert.deepEqual(changes.unavailableCandidates, []);
});

test("a complete crawl marks an available resident missing from the roster unavailable, not adopted", () => {
  const resident = { id: "resident-1", name: "Hattie", available: true };
  const changes = planRosterAvailabilityChanges(
    [resident],
    [rosterCompanion("Walnut", false)],
    { usedFallbackCapture: false, rosterComplete: true },
  );

  assert.deepEqual(changes.adoptedCandidates, []);
  assert.deepEqual(changes.unavailableCandidates, [resident]);
});

test("an incomplete crawl does not restore an unavailable resident", () => {
  const changes = planRosterAvailabilityChanges(
    [{ id: "resident-1", name: "Hattie", available: false }],
    [rosterCompanion("Hattie", false)],
    { usedFallbackCapture: false, rosterComplete: false },
  );

  assert.deepEqual(changes.availableCandidates, []);
});

test("a complete live roster restores an unavailable resident and not an adopted resident", () => {
  const unavailable = {
    id: "resident-1", name: "Hattie", available: false, unavailabilityReason: "unavailable" as const,
  };
  const adopted = {
    id: "resident-2", name: "Walnut", available: false, unavailabilityReason: "adopted" as const,
  };
  const changes = planRosterAvailabilityChanges(
    [unavailable, adopted],
    [rosterCompanion("Hattie", false), rosterCompanion("Walnut", false)],
    { usedFallbackCapture: false, rosterComplete: true },
  );

  assert.deepEqual(changes.availableCandidates, [unavailable]);
});

test("a configured local capture is the real source, not a scrape fallback", async () => {
  const roster = await loadRoster("seed/dogs-page-A.html");

  assert.equal(roster.usedFallbackCapture, false);
  assert.equal(roster.rosterComplete, true);
  assert.equal(roster.source, "seed/dogs-page-A.html");
  assert.match(roster.text, /Hattie/);
});

test("an unreachable remote source is flagged as a fallback capture", async () => {
  const roster = await loadRoster("https://example.test/companions-and-more");

  assert.equal(roster.usedFallbackCapture, true);
  assert.equal(roster.rosterComplete, false);
  assert.equal(roster.source, "seed/dogs-page-A.html");
  assert.match(roster.text, /Walnut/);
});
