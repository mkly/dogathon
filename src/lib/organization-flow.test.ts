import assert from "node:assert/strict";
import test from "node:test";

import { memoryAdapter } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth/minimal";
import { organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

const origin = "http://localhost:3000";

function cookie(response: Response) {
  return response.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
}

test("owner manages pending invitations and a volunteer member end to end", async () => {
  const invitationEmails: Array<{ email: string; id: string; role: string }> = [];
  const accessControl = createAccessControl(defaultStatements);
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
        ac: accessControl,
        roles: {
          owner: ownerAc,
          admin: adminAc,
          member: memberAc,
          volunteer: accessControl.newRole({}),
        },
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

  async function get(path: string, sessionCookie: string) {
    return auth.handler(new Request(`${origin}/api/auth${path}`, {
      headers: { cookie: sessionCookie },
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

  async function activeOrganizationId() {
    const response = await auth.handler(new Request(`${origin}/api/auth/get-session`, {
      headers: { cookie: ownerCookie },
    }));
    assert.equal(response.status, 200);
    const session = await response.json() as { session: { activeOrganizationId: string | null } };
    return session.session.activeOrganizationId;
  }

  assert.equal(await activeOrganizationId(), created.id);

  const secondCreatedResponse = await call(
    "/organization/create",
    { name: "Second Rescue", slug: "second-rescue" },
    ownerCookie,
  );
  assert.equal(secondCreatedResponse.status, 200);
  const secondCreated = await secondCreatedResponse.json() as { id: string };
  assert.equal(await activeOrganizationId(), secondCreated.id);

  const invitationResponse = await call(
    "/organization/invite-member",
    { email: "volunteer@example.com", role: "volunteer", organizationId: created.id },
    ownerCookie,
  );
  assert.equal(invitationResponse.status, 200);
  const invitation = await invitationResponse.json() as { id: string; role: string };
  assert.equal(invitation.role, "volunteer");

  const pendingResponse = await get(
    `/organization/list-invitations?organizationId=${created.id}`,
    ownerCookie,
  );
  assert.equal(pendingResponse.status, 200);
  const pending = await pendingResponse.json() as Array<{
    email: string;
    id: string;
    inviterId: string;
    role: string;
    status: string;
  }>;
  assert.deepEqual(
    pending.map(({ email, id, role, status }) => ({ email, id, role, status })),
    [{ email: "volunteer@example.com", id: invitation.id, role: "volunteer", status: "pending" }],
  );
  assert.ok(pending[0]?.inviterId);

  const cancelledResponse = await call(
    "/organization/cancel-invitation",
    { invitationId: invitation.id },
    ownerCookie,
  );
  assert.equal(cancelledResponse.status, 200);
  const cancelled = await cancelledResponse.json() as { status: string };
  assert.equal(cancelled.status, "canceled");

  const acceptedInvitationResponse = await call(
    "/organization/invite-member",
    { email: "accepted-volunteer@example.com", role: "volunteer", organizationId: created.id },
    ownerCookie,
  );
  assert.equal(acceptedInvitationResponse.status, 200);
  const acceptedInvitation = await acceptedInvitationResponse.json() as { id: string; role: string };
  const duplicateInvitationResponse = await call(
    "/organization/invite-member",
    { email: "accepted-volunteer@example.com", role: "member", organizationId: created.id },
    ownerCookie,
  );
  assert.equal(duplicateInvitationResponse.status, 400);
  const duplicateInvitation = await duplicateInvitationResponse.json() as { code: string };
  assert.equal(duplicateInvitation.code, "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION");
  assert.deepEqual(invitationEmails, [
    { email: "volunteer@example.com", id: invitation.id, role: "volunteer" },
    {
      email: "accepted-volunteer@example.com",
      id: acceptedInvitation.id,
      role: "volunteer",
    },
  ]);

  const volunteerSignUp = await call("/sign-up/email", {
    email: "accepted-volunteer@example.com",
    name: "Volunteer",
    password: "volunteer-password",
  });
  assert.equal(volunteerSignUp.status, 200);

  const acceptedResponse = await call(
    "/organization/accept-invitation",
    { invitationId: acceptedInvitation.id },
    cookie(volunteerSignUp),
  );
  assert.equal(acceptedResponse.status, 200);
  const accepted = await acceptedResponse.json() as {
    invitation: { status: string };
    member: { organizationId: string; role: string };
  };
  assert.equal(accepted.invitation.status, "accepted");
  assert.equal(accepted.member.organizationId, created.id);
  assert.equal(accepted.member.role, "volunteer");

  const memberListResponse = await get(
    `/organization/list-members?organizationId=${created.id}&limit=100`,
    ownerCookie,
  );
  assert.equal(memberListResponse.status, 200);
  const memberList = await memberListResponse.json() as {
    members: Array<{ id: string; role: string; user: { email: string } }>;
  };
  const volunteer = memberList.members.find((member) => (
    member.user.email === "accepted-volunteer@example.com"
  ));
  assert.equal(volunteer?.role, "volunteer");

  const promotedResponse = await call(
    "/organization/update-member-role",
    { memberId: volunteer?.id, organizationId: created.id, role: "admin" },
    ownerCookie,
  );
  assert.equal(promotedResponse.status, 200);
  const promoted = await promotedResponse.json() as { role: string };
  assert.equal(promoted.role, "admin");

  const alreadyMemberResponse = await call(
    "/organization/invite-member",
    { email: "accepted-volunteer@example.com", role: "member", organizationId: created.id },
    ownerCookie,
  );
  assert.equal(alreadyMemberResponse.status, 400);
  const alreadyMember = await alreadyMemberResponse.json() as { code: string };
  assert.equal(alreadyMember.code, "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION");

  const removedResponse = await call(
    "/organization/remove-member",
    { memberIdOrEmail: volunteer?.id, organizationId: created.id },
    ownerCookie,
  );
  assert.equal(removedResponse.status, 200);

  const finalMembersResponse = await get(
    `/organization/list-members?organizationId=${created.id}&limit=100`,
    ownerCookie,
  );
  assert.equal(finalMembersResponse.status, 200);
  const finalMembers = await finalMembersResponse.json() as {
    members: Array<{ user: { email: string } }>;
  };
  assert.equal(
    finalMembers.members.some((member) => member.user.email === "accepted-volunteer@example.com"),
    false,
  );
});
