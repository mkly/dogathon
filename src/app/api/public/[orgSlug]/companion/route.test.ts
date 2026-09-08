import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { createPublicCompanionHandlers } = await import("./route.ts");

const organization = {
  id: "org-1",
  settings: {
    allowedOrigins: ["https://rescue.example"],
  },
  sponsorshipTiers: [{ monthlyCents: 3250 }],
};

const resident = {
  id: "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8",
  name: "Biscuit",
  slug: "biscuit",
  sourceUrl: "https://rescue.example/dogs/biscuit",
  breed: "Corgi mix",
  ageText: "Adult",
  sex: "Female",
  photoUrls: ["https://images.example/biscuit.jpg"],
  status: "available" as const,
  _count: { sponsorships: 0 },
};

function context() {
  return { params: Promise.resolve({ orgSlug: "happy-paws" }) };
}

function request(origin?: string) {
  const headers = new Headers({ "x-real-ip": "192.0.2.10" });
  if (origin) headers.set("origin", origin);
  return new Request(
    "https://pawcast.example/api/public/happy-paws/companion?source=https%3A%2F%2FRESCUE.example%2Fdogs%2Fbiscuit%2F%3Futm_source%3Dcms%23bio",
    { headers },
  );
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    async getOrganization() { return organization; },
    async getResidentBySlug() { return resident; },
    async getResidentBySource(orgId: string, sourceUrl: string) {
      assert.equal(orgId, "org-1");
      assert.equal(sourceUrl, "https://rescue.example/dogs/biscuit");
      return resident;
    },
    async rateLimit() { return { allowed: true, retryAfterSeconds: 60 }; },
    ...overrides,
  } as never;
}

test("returns the public companion contract and allows a configured origin", async () => {
  const { GET } = createPublicCompanionHandlers(dependencies());
  const response = await GET(request("https://rescue.example"), context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://rescue.example");
  assert.equal(response.headers.get("vary"), "Origin");
  assert.equal(response.headers.get("cache-control"), "public, max-age=60, stale-while-revalidate=300");
  assert.deepEqual(await response.json(), {
    id: resident.id,
    name: "Biscuit",
    slug: "biscuit",
    sourceUrl: "https://rescue.example/dogs/biscuit",
    breed: "Corgi mix",
    ageText: "Adult",
    sex: "Female",
    photoUrl: "https://images.example/biscuit.jpg",
    monthlyCents: 3250,
    currency: "usd",
    status: "available",
    companionUrl: `https://pawcast.example/happy-paws/companions/${resident.id}`,
    sponsorUrl: "https://pawcast.example/happy-paws/sponsor?source=https%3A%2F%2Frescue.example%2Fdogs%2Fbiscuit",
  });
});

test("looks up by companion slug and gives it precedence over source", async () => {
  let sourceLookedUp = false;
  const { GET } = createPublicCompanionHandlers(dependencies({
    async getResidentBySlug(orgId: string, slug: string) {
      assert.equal(orgId, "org-1");
      assert.equal(slug, "biscuit");
      return resident;
    },
    async getResidentBySource() {
      sourceLookedUp = true;
      return null;
    },
  }));
  const response = await GET(new Request(
    "https://pawcast.example/api/public/happy-paws/companion?companion=biscuit&source=https%3A%2F%2Fwrong.example%2Fdog",
    { headers: { "x-real-ip": "192.0.2.10" } },
  ), context());

  assert.equal(response.status, 200);
  assert.equal(sourceLookedUp, false);
  assert.equal((await response.json()).slug, "biscuit");
});

test("omits CORS permission for a disallowed origin while still serving the response", async () => {
  const { GET } = createPublicCompanionHandlers(dependencies({
    async getResidentBySource() {
      return { ...resident, _count: { sponsorships: 1 } };
    },
  }));
  const response = await GET(request("https://other.example"), context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal((await response.json()).status, "sponsored");
});

test("handles preflight for configured origins", async () => {
  const { OPTIONS } = createPublicCompanionHandlers(dependencies());
  const preflight = new Request(request("https://rescue.example"), {
    method: "OPTIONS",
    headers: {
      origin: "https://rescue.example",
      "access-control-request-method": "GET",
    },
  });
  const response = await OPTIONS(preflight, context());

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://rescue.example");
  assert.equal(response.headers.get("access-control-allow-methods"), "GET, OPTIONS");
  assert.equal(response.headers.get("vary"), "Origin");
});

test("returns a CORS-aware 404 for an unknown source", async () => {
  const { GET } = createPublicCompanionHandlers(dependencies({
    async getResidentBySource() { return null; },
  }));
  const response = await GET(request("https://rescue.example"), context());

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("access-control-allow-origin"), "https://rescue.example");
  assert.deepEqual(await response.json(), { error: "Companion not found" });
});

test("rate limits reads before looking up a companion", async () => {
  let lookedUp = false;
  const { GET } = createPublicCompanionHandlers(dependencies({
    async getResidentBySource() {
      lookedUp = true;
      return resident;
    },
    async rateLimit() { return { allowed: false, retryAfterSeconds: 17 }; },
  }));
  const response = await GET(request(), context());

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "17");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(lookedUp, false);
});

test("adopted companions take precedence over active sponsorships", async () => {
  const { GET } = createPublicCompanionHandlers(dependencies({
    async getResidentBySource() {
      return { ...resident, status: "adopted", _count: { sponsorships: 1 } };
    },
  }));
  const response = await GET(request(), context());

  assert.equal((await response.json()).status, "adopted");
});
