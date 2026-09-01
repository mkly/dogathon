import type { OrganizationRole } from "@/lib/organization-access";

type MemberMutationPolicy = {
  actorRole: "owner" | "admin";
  actorUserId: string;
  ownerCount: number;
  targetRole: OrganizationRole;
  targetUserId: string;
};

export function roleChangeBlockedReason(policy: MemberMutationPolicy) {
  if (policy.actorRole === "admin" && policy.targetRole === "owner") {
    return "Admins cannot change an owner’s role.";
  }
  if (policy.targetRole === "owner" && policy.ownerCount <= 1) {
    return "This is the organization’s last owner. Add another owner before changing this role.";
  }
  return null;
}

export function removalBlockedReason(policy: MemberMutationPolicy) {
  if (policy.actorUserId === policy.targetUserId) {
    return "You cannot remove yourself from the members list.";
  }
  if (policy.actorRole === "admin" && policy.targetRole === "owner") {
    return "Admins cannot remove an owner.";
  }
  if (policy.targetRole === "owner" && policy.ownerCount <= 1) {
    return "This is the organization’s last owner and cannot be removed.";
  }
  return null;
}
