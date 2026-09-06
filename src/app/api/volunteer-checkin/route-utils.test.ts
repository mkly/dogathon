import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { createGetInterviewRouteContext } = await import("./route-utils.ts");

const input = {
  messages: [{ id: "message-1", parts: [{ type: "text" as const, text: "A calm walk." }], role: "user" as const }],
  orgSlug: "huffy-puff",
  residentId: "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8",
};

function access(authenticated: boolean) {
  return {
    authenticated,
    context: null,
    organization: { id: "org-1", name: "Huffy Puff", slug: "huffy-puff" },
  };
}

function routeFor(authenticated: boolean) {
  return createGetInterviewRouteContext({
    async findCompanion() { return null; },
    async getAccess() { return access(authenticated); },
  } as never);
}

test("returns 401 when the interview request is unauthenticated", async () => {
  const result = await routeFor(false)(new Request("http://localhost/api/volunteer-checkin/chat"), input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 401);
});

test("returns 403 when the interview user is not an organization member", async () => {
  const result = await routeFor(true)(new Request("http://localhost/api/volunteer-checkin/chat"), input);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.response.status, 403);
});
