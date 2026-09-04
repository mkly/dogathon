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

const roleDetails: Record<string, { article: "a" | "an"; description: string; label: string }> = {
  admin: {
    article: "an",
    description: "Manage staff, rescue settings, and day-to-day rescue work.",
    label: "Admin",
  },
  member: {
    article: "a",
    description: "Contribute companion notes and help keep rescue records current.",
    label: "Member",
  },
  volunteer: {
    article: "a",
    description: "Share companion care notes and help with the rescue roster.",
    label: "Volunteer",
  },
};

export function describeInvitationRole(role: string) {
  return roleDetails[role] ?? {
    article: "a",
    description: "Help with the rescue work available to this role.",
    label: role,
  };
}
