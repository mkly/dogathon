import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { createVolunteerPhotoPostHandler } = await import("./route.ts");
const residentId = "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8";

function request(photo = new File([Uint8Array.from([1, 2])], "walk.jpg")) {
  const formData = new FormData();
  formData.set("orgSlug", "huffy-puff");
  formData.set("residentId", residentId);
  formData.set("photo", photo);
  return new Request("http://localhost/api/volunteer-photos", { method: "POST", body: formData });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    async createPhoto() {},
    async deletePhoto() {},
    async findResident() { return true; },
    async getAccess() {
      return {
        authenticated: true,
        context: { memberId: "member-1", orgId: "org-1", role: "volunteer", userId: "user-1" },
        organization: { id: "org-1", name: "Huffy Puff", slug: "huffy-puff" },
      };
    },
    newId: () => "8f77b971-f0b5-493c-aa9a-5931c1f17ea5",
    async processPhoto() { return { data: Uint8Array.from([4, 5]), mime: "image/jpeg" as const }; },
    async putPhoto() { return { url: "/api/volunteer-photos/photo-1?org=org-1" }; },
    async rateLimit() { return { allowed: true, retryAfterSeconds: 60 }; },
    ...overrides,
  } as never;
}

test("rejects unauthenticated and wrong-organization uploads", async () => {
  const unauthenticated = createVolunteerPhotoPostHandler(dependencies({
    async getAccess() {
      return {
        authenticated: false,
        context: null,
        organization: { id: "org-1", name: "Huffy Puff", slug: "huffy-puff" },
      };
    },
  }));
  assert.equal((await unauthenticated(request())).status, 401);

  const wrongOrganization = createVolunteerPhotoPostHandler(dependencies({
    async getAccess() {
      return {
        authenticated: true,
        context: null,
        organization: { id: "org-1", name: "Huffy Puff", slug: "huffy-puff" },
      };
    },
  }));
  assert.equal((await wrongOrganization(request())).status, 403);
});

test("validates processed image content and stores only photo metadata", async () => {
  const invalid = createVolunteerPhotoPostHandler(dependencies({
    async processPhoto() { return undefined; },
  }));
  assert.deepEqual(await (await invalid(request())).json(), { error: "photo-type" });

  let created: unknown;
  const valid = createVolunteerPhotoPostHandler(dependencies({
    async createPhoto(input: unknown) { created = input; },
  }));
  const response = await valid(request());
  assert.equal(response.status, 201);
  assert.deepEqual(created, {
    id: "8f77b971-f0b5-493c-aa9a-5931c1f17ea5",
    orgId: "org-1",
    residentId,
    storageKey: "orgs/org-1/volunteer-photos/8f77b971-f0b5-493c-aa9a-5931c1f17ea5.jpg",
    url: "/api/volunteer-photos/photo-1?org=org-1",
    mime: "image/jpeg",
    byteSize: 2,
  });
});
