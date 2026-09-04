import assert from "node:assert/strict";
import test from "node:test";

import { organizationInvitationEmail } from "./organization-invitation-email.ts";

test("organization invitation email explains who invited the recipient and what happens next", () => {
  const message = organizationInvitationEmail({
    baseUrl: "https://dogathon.example",
    email: "helper@example.com",
    id: "d9ac83c1-1223-4988-8782-2aa5b4df4e30",
    inviterName: "Riley Rescuer",
    organizationName: "Happy Tails Rescue",
    role: "volunteer",
  });

  assert.equal(message.to, "helper@example.com");
  assert.match(message.body, /Riley Rescuer invited you to join Happy Tails Rescue/);
  assert.match(message.body, /As a volunteer, you can share companion care notes/);
  assert.match(
    message.body,
    /https:\/\/dogathon\.example\/staff\/invitations\/d9ac83c1-1223-4988-8782-2aa5b4df4e30/,
  );
  assert.match(message.body, /expires in 48 hours/);
  assert.match(message.body, /do not have a Dogathon account.*create one in about a minute/);
});
