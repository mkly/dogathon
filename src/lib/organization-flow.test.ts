import assert from "node:assert/strict";
import test from "node:test";

import { memoryAdapter } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins";

const origin = "http://localhost:3000";

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("owner creates an organization and an invitee accepts the volunteer role", async () => {
  const invitationEmails: Array<{ email: string; id: string; role: string }> = [];
  const auth = betterAuth({
    baseURL: origin,
    secret: "organization-flow-test-secret-at-least-32-characters",
    database: memoryAdapter({
      account: [],
      invitation: [],
      member: [],
      organization: [],
      session: [],
      user: [],
      verification: [],
    }),
    emailAndPassword: { enabled: true },
    plugins: [
      organization({
        sendInvitationEmail: async ({ email, id, role }) => {
          invitationEmails.push({ email, id, role });
        },
      }),
    ],
  });

  async function call(path: string, body: Record<string, unknown>, sessionCookie?: string) {
    return auth.handler(new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        ...(sessionCookie ? { cookie: sessionCookie } : {}),
      },
      body: JSON.stringify(body),
    }));
  }

  const ownerSignUp = await call("/sign-up/email", {
    email: "owner@example.com",
    name: "Owner",
    password: "owner-password",
  });
  assert.equal(ownerSignUp.status, 200);
  const ownerCookie = cookie(ownerSignUp);

  const createdResponse = await call(
    "/organization/create",
    { name: "Test Rescue", slug: "test-rescue" },
    ownerCookie,
  );
  assert.equal(createdResponse.status, 200);
  const created = await createdResponse.json() as { id: string; members: Array<{ role: string }> };
  assert.equal(created.members[0]?.role, "owner");

  const invitationResponse = await call(
    "/organization/invite-member",
    { email: "volunteer@example.com", role: "member", organizationId: created.id },
    ownerCookie,
  );
  assert.equal(invitationResponse.status, 200);
  const invitation = await invitationResponse.json() as { id: string; role: string };
  assert.equal(invitation.role, "member");
  assert.deepEqual(invitationEmails, [
    { email: "volunteer@example.com", id: invitation.id, role: "member" },
  ]);

  const volunteerSignUp = await call("/sign-up/email", {
    email: "volunteer@example.com",
    name: "Volunteer",
    password: "volunteer-password",
  });
  assert.equal(volunteerSignUp.status, 200);

  const acceptedResponse = await call(
    "/organization/accept-invitation",
    { invitationId: invitation.id },
    cookie(volunteerSignUp),
  );
  assert.equal(acceptedResponse.status, 200);
  const accepted = await acceptedResponse.json() as {
    invitation: { status: string };
    member: { organizationId: string; role: string };
  };
  assert.equal(accepted.invitation.status, "accepted");
  assert.equal(accepted.member.organizationId, created.id);
  assert.equal(accepted.member.role, "member");
});
