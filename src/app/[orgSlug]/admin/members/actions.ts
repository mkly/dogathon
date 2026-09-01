"use server";

import { APIError } from "better-auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { removalBlockedReason, roleChangeBlockedReason } from "@/lib/member-management";
import {
  getOrganizationAccessBySlug,
  ORGANIZATION_ROLES,
  type OrganizationRole,
} from "@/lib/organization-access";

const ASSIGNABLE_ROLES = ["admin", "member", "volunteer"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export type MemberActionResult = { ok: boolean; message: string };

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

async function mutationContext(orgSlug: string, memberId: string) {
  const requestHeaders = await headers();
  const access = await getOrganizationAccessBySlug(requestHeaders, orgSlug, ["owner", "admin"]);
  if (!access?.context) return null;

  const firstPage = await auth.api.listMembers({
    headers: requestHeaders,
    query: { limit: 100, organizationId: access.context.orgId },
  });
  const result = firstPage.members.length < firstPage.total
    ? await auth.api.listMembers({
        headers: requestHeaders,
        query: { limit: firstPage.total, organizationId: access.context.orgId },
      })
    : firstPage;
  const target = result.members.find((member) => member.id === memberId);
  if (!target) return null;

  const targetRole = ORGANIZATION_ROLES.includes(target.role as OrganizationRole)
    ? target.role as OrganizationRole
    : null;
  if (!targetRole) return null;

  return {
    actorRole: access.context.role as "owner" | "admin",
    actorUserId: access.context.userId,
    headers: requestHeaders,
    organizationId: access.context.orgId,
    ownerCount: result.members.filter((member) => member.role === "owner").length,
    targetRole,
    targetUserId: target.userId,
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
    context = await mutationContext(input.orgSlug, input.memberId);
  } catch (error) {
    return {
      ok: false,
      message: apiErrorMessage(error, "The members list could not be verified. Try again."),
    };
  }
  if (!context) {
    return { ok: false, message: "You no longer have permission to manage this member." };
  }
  const blocked = roleChangeBlockedReason(context);
  if (blocked) return { ok: false, message: blocked };

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
    context = await mutationContext(input.orgSlug, input.memberId);
  } catch (error) {
    return {
      ok: false,
      message: apiErrorMessage(error, "The members list could not be verified. Try again."),
    };
  }
  if (!context) {
    return { ok: false, message: "You no longer have permission to manage this member." };
  }
  const blocked = removalBlockedReason(context);
  if (blocked) return { ok: false, message: blocked };

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
