"use server";

import { APIError } from "better-auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getOrganizationAccessBySlug } from "@/lib/organization-access";

const ASSIGNABLE_ROLES = ["admin", "member", "volunteer"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type MemberActionResult = { ok: boolean; message: string };
export type InvitationActionResult = { ok: boolean; message: string };

function apiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof APIError)) return fallback;

  switch (error.body?.code) {
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER":
    case "YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER":
      return "The organization must always have at least one owner.";
    case "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER":
      return "You are not allowed to change this member’s role.";
    case "YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER":
      return "You are not allowed to remove this member.";
    case "MEMBER_NOT_FOUND":
      return "That member is no longer in this organization.";
    default:
      return fallback;
  }
}

function invitationApiErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof APIError)) return fallback;

  switch (error.body?.code) {
    case "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION":
      return "That email already belongs to a member of this organization.";
    case "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION":
      return "That email already has a pending invitation.";
    case "YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION":
      return "You are not allowed to invite people to this organization.";
    case "YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION":
      return "You are not allowed to cancel this invitation.";
    case "INVITATION_LIMIT_REACHED":
      return "This organization has reached its pending invitation limit.";
    case "INVITATION_NOT_FOUND":
      return "That invitation is no longer available.";
    default:
      return fallback;
  }
}

async function invitationContext(orgSlug: string) {
  const requestHeaders = await headers();
  const access = await getOrganizationAccessBySlug(requestHeaders, orgSlug, {
    members: ["manage"],
  });
  if (!access?.context) return null;

  return {
    headers: requestHeaders,
    organizationId: access.context.orgId,
  };
}

export async function inviteOrganizationMember(input: {
  email: string;
  orgSlug: string;
  role: AssignableRole;
}): Promise<InvitationActionResult> {
  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) {
    return { ok: false, message: "Enter a valid email address." };
  }
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    return { ok: false, message: "Choose admin, member, or volunteer as the role." };
  }

  const context = await invitationContext(input.orgSlug);
  if (!context) {
    return { ok: false, message: "You no longer have permission to invite people here." };
  }

  try {
    await auth.api.createInvitation({
      body: { email, role: input.role, organizationId: context.organizationId },
      headers: context.headers,
    });
  } catch (error) {
    return {
      ok: false,
      message: invitationApiErrorMessage(error, "The invitation could not be sent. Try again."),
    };
  }

  revalidatePath(`/${input.orgSlug}/admin/members`);
  return { ok: true, message: `Invitation sent to ${email}.` };
}

export async function cancelOrganizationInvitation(input: {
  invitationId: string;
  orgSlug: string;
}): Promise<InvitationActionResult> {
  const context = await invitationContext(input.orgSlug);
  if (!context) {
    return { ok: false, message: "You no longer have permission to manage invitations here." };
  }

  try {
    const invitations = await auth.api.listInvitations({
      headers: context.headers,
      query: { organizationId: context.organizationId },
    });
    const invitation = invitations.find((item) => (
      item.id === input.invitationId && item.status === "pending"
    ));
    if (!invitation) {
      return { ok: false, message: "That invitation is no longer pending." };
    }

    await auth.api.cancelInvitation({
      body: { invitationId: invitation.id },
      headers: context.headers,
    });
  } catch (error) {
    return {
      ok: false,
      message: invitationApiErrorMessage(error, "The invitation could not be cancelled. Try again."),
    };
  }

  revalidatePath(`/${input.orgSlug}/admin/members`);
  return { ok: true, message: "Invitation cancelled." };
}

export async function resendOrganizationInvitation(input: {
  invitationId: string;
  orgSlug: string;
}): Promise<InvitationActionResult> {
  const context = await invitationContext(input.orgSlug);
  if (!context) {
    return { ok: false, message: "You no longer have permission to manage invitations here." };
  }

  try {
    const invitations = await auth.api.listInvitations({
      headers: context.headers,
      query: { organizationId: context.organizationId },
    });
    const invitation = invitations.find((item) => (
      item.id === input.invitationId && item.status === "pending"
    ));
    if (!invitation) {
      return { ok: false, message: "That invitation is no longer pending." };
    }

    await auth.api.createInvitation({
      body: {
        email: invitation.email,
        organizationId: context.organizationId,
        resend: true,
        role: invitation.role,
      },
      headers: context.headers,
    });
  } catch (error) {
    return {
      ok: false,
      message: invitationApiErrorMessage(error, "The invitation could not be resent. Try again."),
    };
  }

  revalidatePath(`/${input.orgSlug}/admin/members`);
  return { ok: true, message: "Invitation resent." };
}

async function mutationContext(orgSlug: string) {
  const requestHeaders = await headers();
  const access = await getOrganizationAccessBySlug(requestHeaders, orgSlug, {
    members: ["manage"],
  });
  if (!access?.context) return null;

  return {
    actorMemberId: access.context.memberId,
    headers: requestHeaders,
    organizationId: access.context.orgId,
  };
}

export async function updateOrganizationMemberRole(input: {
  memberId: string;
  orgSlug: string;
  role: AssignableRole;
}): Promise<MemberActionResult> {
  if (!ASSIGNABLE_ROLES.includes(input.role)) {
    return { ok: false, message: "Choose admin, member, or volunteer as the new role." };
  }

  let context: Awaited<ReturnType<typeof mutationContext>>;
  try {
    context = await mutationContext(input.orgSlug);
  } catch (error) {
    return {
      ok: false,
      message: apiErrorMessage(error, "The members list could not be verified. Try again."),
    };
  }
  if (!context) {
    return { ok: false, message: "You no longer have permission to manage this member." };
  }

  try {
    await auth.api.updateMemberRole({
      body: {
        memberId: input.memberId,
        organizationId: context.organizationId,
        role: input.role,
      },
      headers: context.headers,
    });
  } catch (error) {
    return { ok: false, message: apiErrorMessage(error, "The role could not be changed. Try again.") };
  }

  revalidatePath(`/${input.orgSlug}/admin/members`);
  return { ok: true, message: `Role changed to ${input.role}.` };
}

export async function removeOrganizationMember(input: {
  memberId: string;
  orgSlug: string;
}): Promise<MemberActionResult> {
  let context: Awaited<ReturnType<typeof mutationContext>>;
  try {
    context = await mutationContext(input.orgSlug);
  } catch (error) {
    return {
      ok: false,
      message: apiErrorMessage(error, "The members list could not be verified. Try again."),
    };
  }
  if (!context) {
    return { ok: false, message: "You no longer have permission to manage this member." };
  }
  if (input.memberId === context.actorMemberId) return { ok: false, message: "You cannot remove yourself from the members list." };

  try {
    await auth.api.removeMember({
      body: { memberIdOrEmail: input.memberId, organizationId: context.organizationId },
      headers: context.headers,
    });
  } catch (error) {
    return { ok: false, message: apiErrorMessage(error, "The member could not be removed. Try again.") };
  }

  revalidatePath(`/${input.orgSlug}/admin/members`);
  return { ok: true, message: "Member removed from the organization." };
}
