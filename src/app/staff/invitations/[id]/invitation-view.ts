export type InvitationState =
  | "pending"
  | "expired"
  | "accepted"
  | "cancelled"
  | "unknown";

type InvitationStateInput = {
  expiresAt: Date;
  status: string;
} | null;

export function invitationState(
  invitation: InvitationStateInput,
  now = new Date(),
): InvitationState {
  if (!invitation) return "unknown";
  if (invitation.status === "accepted") return "accepted";
  if (invitation.status !== "pending") return "cancelled";
  if (invitation.expiresAt.getTime() <= now.getTime()) return "expired";
  return "pending";
}

const roleDetails: Record<string, { description: string; label: string }> = {
  admin: {
    description: "Manage staff, rescue settings, and day-to-day rescue work.",
    label: "Admin",
  },
  member: {
    description: "Contribute companion notes and help keep rescue records current.",
    label: "Member",
  },
  volunteer: {
    description: "Share companion care notes and help with the rescue roster.",
    label: "Volunteer",
  },
};

export function describeInvitationRole(role: string) {
  return roleDetails[role] ?? {
    description: "Help with the rescue work available to this role.",
    label: role,
  };
}
