import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://dogathon:dogathon@localhost:5432/dogathon";

const { createGetInterviewRouteContext } = await import("./route-utils.ts");

const input = {
  messages: [{ id: "message-1", parts: [{ type: "text" as const, text: "A calm walk." }], role: "user" as const }],
  orgSlug: "huffy-puff",
  checkInId: "5af589d8-dc5f-4bc7-9ce3-2ca9f06833c8",
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
    async findCheckIn() { return null; },
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

test("accepts only the next user message after the stored transcript", async () => {
  const stored = [
    { id: "u0", parts: [{ type: "text" as const, text: "A calm walk." }], role: "user" as const },
    { id: "a0", parts: [{ type: "text" as const, text: "How was her mood?" }], role: "assistant" as const },
  ];
  const route = createGetInterviewRouteContext({
    async findCheckIn() {
      return {
        companion: { ageText: "Adult", breed: "Corgi", name: "Biscuit", sex: "Female" },
        transcript: stored,
      };
    },
    async getAccess() {
      return {
        authenticated: true,
        context: { memberId: "member-1", orgId: "org-1", role: "volunteer", userId: "user-1" },
        organization: { id: "org-1", name: "Huffy Puff", slug: "huffy-puff" },
      };
    },
  } as never);
  const request = new Request("http://localhost/api/volunteer-checkin/chat");
  const nextInput = {
    ...input,
    messages: [...stored, { id: "u1", parts: [{ type: "text" as const, text: "She was happy." }], role: "user" as const }],
  };

  const accepted = await route(request, nextInput);
  assert.equal(accepted.ok, true);

  const replaced = await route(request, { ...nextInput, messages: [nextInput.messages[2]] });
  assert.equal(replaced.ok, false);
  if (!replaced.ok) assert.equal(replaced.response.status, 409);
});
