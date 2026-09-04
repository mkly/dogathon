import { auth, type OrganizationPermission } from "@/lib/auth";
import { getSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export const ORGANIZATION_ROLES = ["owner", "admin", "member", "volunteer"] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number];

export type OrganizationContext = {
  memberId: string;
  orgId: string;
  role: OrganizationRole;
  userId: string;
};

type MembershipLike = {
  id: string;
  organizationId: string;
  role: string;
  userId: string;
};

type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
};

export type OrganizationSlugAccess = {
  authenticated: boolean;
  context: OrganizationContext | null;
  organization: OrganizationSummary;
};

type PermissionApi = Pick<typeof auth.api, "hasPermission">;

/**
 * better-auth's hasPermission endpoint throws (UNAUTHORIZED) when the caller is
 * not a member of the organization, and rejects rather than resolving false for
 * other request problems. Every caller here treats "cannot prove permission" the
 * same way, so collapse both shapes into one boolean.
 */
export async function checkOrganizationPermission(
  requestHeaders: Headers,
  organizationId: string,
  permission: OrganizationPermission,
  api: PermissionApi = auth.api,
): Promise<boolean> {
  try {
    const result = await api.hasPermission({
      body: { organizationId, permissions: permission },
      headers: requestHeaders,
    });
    return result.success;
  } catch {
    return false;
  }
}

function organizationContext(
  userId: string,
  membership: MembershipLike | null,
  orgId: string,
): OrganizationContext | null {
  if (!membership) return null;
  if (membership.organizationId !== orgId || membership.userId !== userId) return null;
  if (!ORGANIZATION_ROLES.includes(membership.role as OrganizationRole)) return null;
  return { memberId: membership.id, orgId, role: membership.role as OrganizationRole, userId };
}

export async function getOrganizationAccessBySlug(
  requestHeaders: Headers,
  slug: string,
  permission: OrganizationPermission,
): Promise<OrganizationSlugAccess | null> {
  const [organization, session] = await Promise.all([
    prisma.organization.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    }),
    getSession(requestHeaders),
  ]);
  if (!organization) return null;

  if (!session) return { authenticated: false, context: null, organization };

  const [membership, permitted] = await Promise.all([
    prisma.member.findUnique({
      where: {
        organizationId_userId: { organizationId: organization.id, userId: session.user.id },
      },
      select: { id: true, organizationId: true, role: true, userId: true },
    }),
    checkOrganizationPermission(requestHeaders, organization.id, permission),
  ]);

  return {
    authenticated: true,
    context: permitted
      ? organizationContext(session.user.id, membership, organization.id)
      : null,
    organization,
  };
}

export async function getOrganizationContext(
  requestHeaders: Headers,
  permission: OrganizationPermission,
): Promise<OrganizationContext | null> {
  const session = await getSession(requestHeaders);
  const orgId = session?.session.activeOrganizationId;
  if (!session || !orgId) return null;

  const membership = await prisma.member.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: session.user.id },
    },
    select: { id: true, organizationId: true, role: true, userId: true },
  });
  const permitted = await checkOrganizationPermission(requestHeaders, orgId, permission);

  return permitted ? organizationContext(session.user.id, membership, orgId) : null;
}

export async function requireApiOrganization(
  requestHeaders: Headers,
  permission: OrganizationPermission,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; context: OrganizationContext }
> {
  const slug = requestHeaders.get("x-organization-slug");
  if (slug) {
    const access = await getOrganizationAccessBySlug(requestHeaders, slug, permission);
    if (!access?.context) {
      return {
        ok: false,
        response: Response.json({ error: "Organization membership required" }, { status: 403 }),
      };
    }
    return { ok: true, context: access.context };
  }

  const context = await getOrganizationContext(requestHeaders, permission);
  if (!context) {
    return {
      ok: false,
      response: Response.json({ error: "Organization membership required" }, { status: 403 }),
    };
  }
  return { ok: true, context };
}

export function forOrganization<T extends object>(orgId: string, where?: T): T & { orgId: string } {
  return { ...(where ?? {} as T), orgId };
}
