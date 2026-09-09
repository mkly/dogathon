export const organizationInvitationExpiresInSeconds = 48 * 60 * 60;

const roleDescriptions: Record<string, string> = {
  admin: "manage staff, rescue settings, and day-to-day rescue work",
  member: "contribute companion updates and help keep rescue records current",
  volunteer: "share companion updates and help with the rescue roster",
};

type OrganizationInvitationEmailInput = {
  baseUrl: string;
  email: string;
  id: string;
  inviterName: string;
  organizationName: string;
  role: string;
};

export function organizationInvitationEmail({
  baseUrl,
  email,
  id,
  inviterName,
  organizationName,
  role,
}: OrganizationInvitationEmailInput) {
  const invitationUrl = new URL(
    `/staff/invitations/${encodeURIComponent(id)}`,
    baseUrl,
  );
  const expiryHours = organizationInvitationExpiresInSeconds / (60 * 60);
  const roleDescription =
    roleDescriptions[role] ??
    "help with the rescue work available to this role";

  return {
    to: email,
    subject: `Join ${organizationName} on Dogathon`,
    body: [
      `${inviterName} invited you to join ${organizationName} on Dogathon.`,
      `As a ${role}, you can ${roleDescription}.`,
      "",
      `Open your invitation: ${invitationUrl.toString()}`,
      `This invitation link expires in ${expiryHours} hours.`,
      "If you do not have a Dogathon account yet, you can create one in about a minute.",
    ].join("\n"),
    invitationUrl: invitationUrl.toString(),
  };
}
